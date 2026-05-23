import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = "CryptoChainTrace <noreply@cryptochaintrace.com>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "cryptotheftvictim@proton.me";

export async function sendSubmissionEmails(data: {
  name: string | null;
  email: string;
  victimWallet: string;
  thiefWallet: string;
  chains: string;
  txHashes: string | null;
  description: string | null;
  id: number;
}): Promise<void> {
  console.log(`[email] sendSubmissionEmails called for case #${data.id}`);
  console.log(`[email] RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);
  console.log(`[email] ADMIN_EMAIL: ${ADMIN_EMAIL}`);
  console.log(`[email] FROM: ${FROM}`);

  const resend = getResend();
  if (!resend) {
    const msg = "[email] ERROR: RESEND_API_KEY is not set — cannot send emails";
    console.error(msg);
    throw new Error(msg);
  }

  const displayName = data.name?.trim() || "Applicant";

  // 1. Auto-reply to submitter
  console.log(`[email] Sending auto-reply to: ${data.email}`);
  const autoReplyResult = await resend.emails.send({
    from: FROM,
    to: data.email,
    subject: "Thank you for submitting your case to CryptoChainTrace",
    text: `Dear ${displayName},

Thank you for reaching out and trusting CryptoChainTrace with your case.

We have received your submission. Our team is manually reviewing the details now. Because we only assist verified U.S. victims, this review usually takes 24–48 hours.

If approved, you will receive a complete forensic analysis package suitable for law enforcement, including detailed transaction trails and evidence of fund movements.

You will also receive clear next-step recommendations.

If we need any additional information, we will reply to this email.

Thank you for fighting back.
We are here to help.

Best regards,
Fvck Thieves (Not Real Name)
CryptoChainTrace`,
  });

  if (autoReplyResult.error) {
    console.error(`[email] Auto-reply FAILED to ${data.email}:`, JSON.stringify(autoReplyResult.error));
    throw new Error(`Auto-reply failed: ${JSON.stringify(autoReplyResult.error)}`);
  }
  console.log(`[email] Auto-reply sent OK to ${data.email}, id: ${autoReplyResult.data?.id}`);

  // 2. Admin notification with full details
  console.log(`[email] Sending admin notification to: ${ADMIN_EMAIL}`);
  const adminResult = await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `[New Case #${data.id}] Submission from ${data.email}`,
    text: `New case submission received — Case #${data.id}

Name:           ${data.name ?? "(not provided)"}
Email:          ${data.email}
Victim Wallet:  ${data.victimWallet}
Thief Wallet:   ${data.thiefWallet}
Chains:         ${data.chains}
TX Hashes:      ${data.txHashes ?? "(not provided)"}
Description:
${data.description ?? "(not provided)"}

---
Review submissions in the dashboard at https://cryptochaintrace.com/dashboard
`,
  });

  if (adminResult.error) {
    console.error(`[email] Admin notification FAILED to ${ADMIN_EMAIL}:`, JSON.stringify(adminResult.error));
    throw new Error(`Admin notification failed: ${JSON.stringify(adminResult.error)}`);
  }
  console.log(`[email] Admin notification sent OK to ${ADMIN_EMAIL}, id: ${adminResult.data?.id}`);
}
