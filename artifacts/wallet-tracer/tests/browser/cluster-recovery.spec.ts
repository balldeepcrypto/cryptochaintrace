import { test, expect, type Page } from "@playwright/test";
import { CURSOR, FOCUS, INPUT, LEAD, OWNER, recoveryFixture, transaction } from "./recovery-fixture";
import type { ClusterCheckpoint } from "../../src/lib/cluster-finder-storage";

async function storedCheckpoint(page: Page): Promise<ClusterCheckpoint> {
  return page.evaluate(async (owner) => {
    return new Promise<ClusterCheckpoint>((resolve, reject) => {
      const open = indexedDB.open("cluster-finder-checkpoints", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("checkpoints", "readonly");
        const request = tx.objectStore("checkpoints").get(owner);
        tx.oncomplete = () => { db.close(); resolve(request.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, OWNER);
}

for (const missingUUID of [false, true]) {
  for (const action of ["resume", "retry"] as const) {
    test(`${action} retains saved work and stays on-page (${missingUUID ? "legacy" : "native"} UUID)`, async ({ page, context, browserName }) => {
      expect(browserName).toBe("webkit");
      const fixture = recoveryFixture(action === "resume" ? "running" : "failed");
      const requests: URL[] = [];
      const unexpected: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      // Fresh Playwright context per test means a real, empty WebKit IndexedDB.
      // This route is test-only, not an app route or authentication backdoor.
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        // Fonts are presentation-only. Keep the regression fully offline without
        // treating the app's existing font stylesheet as an unexpected API call.
        if (url.origin === "https://fonts.googleapis.com") {
          return route.fulfill({ contentType: "text/css", body: "" });
        }
        if (url.origin !== "http://127.0.0.1:4179") {
          unexpected.push(url.origin);
          return route.abort();
        }
        if (url.pathname === "/__recovery_fixture") {
          return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated fixture</title>" });
        }
        if (url.pathname.startsWith("/api/")) {
          if (url.pathname === `/api/wallets/${INPUT}/transactions`) {
            requests.push(url);
            // Keep the recovery active while rapid touch/click events arrive.
            await new Promise((resolve) => setTimeout(resolve, 750));
            return route.fulfill({ json: {
              transactions: [transaction(INPUT, LEAD, "recovered-input-page-two")],
              total: 2, page: 2, limit: 500, nextCursor: null, hasMore: false,
            } });
          }
          unexpected.push(url.pathname);
          return route.fulfill({ status: 400, json: { message: "Unexpected fixture request" } });
        }
        return route.continue();
      });
      if (missingUUID) {
        await context.addInitScript(() => {
          Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
        });
      }
      await page.goto("/__recovery_fixture");
      await page.evaluate(async ({ fixture, owner }) => {
        // Synthetic local auth only in this disposable, fully network-mocked context.
        localStorage.setItem("chaintrace-master-auth", JSON.stringify({ exp: Date.now() + 60_000 }));
        await new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("cluster-finder-checkpoints", 1);
          open.onupgradeneeded = () => open.result.createObjectStore("checkpoints");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("checkpoints", "readwrite");
            tx.objectStore("checkpoints").put(fixture, owner);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
        });
      }, { fixture, owner: OWNER });
      await page.goto("/cluster-finder");
      await expect(page.getByTestId("panel-cluster-saved-scan")).toBeVisible();
      await expect(page.getByTestId("section-cluster-results")).toHaveCount(0);
      await expect(page.locator(".react-flow")).toHaveCount(0);
      expect(requests).toHaveLength(0);
      await page.getByTestId("button-load-saved-cluster-results").tap();
      const button = page.getByTestId(`button-${action}-cluster-scan`);
      await expect(button).toBeEnabled();
      await expect(button).toHaveAttribute("type", "button");
      await expect(page.getByTestId("status-cluster-partial-results")).toBeVisible();
      expect(requests).toHaveLength(0); // Never automatically resume on load.
      await expect(page.getByTestId("input-cluster-address-list")).toHaveValue(INPUT);
      await expect(page.getByTestId("input-cluster-primary")).toHaveValue(LEAD);
      await expect(page.getByTestId("input-cluster-focus-wallets")).toHaveValue(FOCUS);
      await expect(page.getByTestId("select-cluster-chain")).toHaveText("Polygon");
      await expect(page.getByTestId("select-cluster-hop-depth")).toHaveText("3 hops");
      expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe(missingUUID ? "undefined" : "function");

      // Edits must not turn recovery into a fresh scan with different settings.
      await page.getByTestId("input-cluster-address-list").fill("edited-input");
      await page.getByTestId("input-cluster-primary").fill("edited-lead");
      await page.getByTestId("input-cluster-focus-wallets").fill("edited-focus");
      await page.getByTestId("select-cluster-chain").click();
      await page.getByRole("option", { name: "Ethereum", exact: true }).click();
      await page.getByTestId("select-cluster-hop-depth").click();
      await page.getByRole("option", { name: "6 hops", exact: true }).click();

      const navigations: string[] = [];
      const popups: Page[] = [];
      const closures: string[] = [];
      page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
      context.on("page", (popup) => popups.push(popup));
      page.on("close", () => closures.push("close"));
      page.on("crash", () => closures.push("crash"));
      await page.evaluate(() => {
        const w = window as typeof window & { recoveryEvents: string[] };
        w.recoveryEvents = [];
        for (const event of ["pagehide", "beforeunload"]) window.addEventListener(event, () => w.recoveryEvents.push(event));
        const open = window.open;
        const close = window.close;
        window.open = (...args) => { w.recoveryEvents.push("window.open"); return open.apply(window, args); };
        window.close = () => { w.recoveryEvents.push("window.close"); close.call(window); };
      });
      // A real WebKit touchscreen tap plus same-task duplicate activations.
      // Capture the element before React removes the recovery controls.
      await button.evaluate((element) => {
        element.addEventListener("click", () => {
          (element as HTMLButtonElement).click();
          (element as HTMLButtonElement).click();
        }, { once: true });
      });
      await button.tap();
      await expect(page.getByTestId("status-cluster-scan-complete")).toBeVisible();
      await expect(page.getByTestId("status-cluster-partial-results")).toHaveCount(0);
      await expect(page.getByTestId("status-cluster-storage-warning")).toHaveCount(0);
      expect(requests).toHaveLength(1); // No refetch for either completed wallet.
      expect(Object.fromEntries(requests[0].searchParams)).toEqual({
        chain: "polygon", page: "2", limit: "500", cursor: CURSOR,
      });
      await expect(page.getByTestId("input-cluster-address-list")).toHaveValue(INPUT);
      await expect(page.getByTestId("input-cluster-primary")).toHaveValue(LEAD);
      await expect(page.getByTestId("input-cluster-focus-wallets")).toHaveValue(FOCUS);
      await expect(page.getByTestId("select-cluster-chain")).toHaveText("Polygon");
      await expect(page.getByTestId("select-cluster-hop-depth")).toHaveText("3 hops");

      const saved = await storedCheckpoint(page);
      expect(saved.state).toBe("complete");
      expect(saved.runId).not.toBe(fixture.runId);
      expect(saved.result?.complete).toBe(true);
      expect(saved.scan?.pagesFetched).toBe(4);
      expect(saved.scan?.scannedTransactions).toBe(4);
      expect(saved.scan?.histories.flatMap((h) => h.transactions.map((tx) => tx.hash)).sort()).toEqual([
        "cached-completed-focus", "cached-completed-lead", "cached-input-page-one", "recovered-input-page-two",
      ]);
      expect(saved.scan?.histories.every((h) => h.finished)).toBe(true);
      expect(saved.result?.connections.map((c) => c.inputAddress)).toContain(INPUT);
      expect(saved.result?.focusAddresses).toEqual([FOCUS]);
      expect(saved).toMatchObject({ chain: "polygon", maxHops: 3, addressText: INPUT, primaryAddress: LEAD, focusText: FOCUS });
      expect(navigations).toEqual([]);
      expect(popups).toEqual([]);
      expect(closures).toEqual([]);
      expect(page.url()).toBe("http://127.0.0.1:4179/cluster-finder");
      expect(await page.evaluate(() => (window as typeof window & { recoveryEvents: string[] }).recoveryEvents)).toEqual([]);
      expect(errors).toEqual([]);
      expect(unexpected).toEqual([]);
    });
  }
}
