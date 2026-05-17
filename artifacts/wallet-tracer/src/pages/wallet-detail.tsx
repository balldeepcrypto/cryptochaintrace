import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetWallet,
  useGetWalletTransactions,
  getGetWalletQueryKey,
  getGetWalletTransactionsQueryKey,
} from "@workspace/api-client-react";
import { AddressDisplay } from "@/components/address-display";
import { saveRecentSearch } from "@/lib/recent-searches";
import { exportAsPdf, exportAsJson, reportFilename, encodeReportForUrl, sha256Sync } from "@/lib/report-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight, ArrowLeft,
  Network, GitFork, FileCode, Tag, ShieldAlert, ShieldCheck, Shield,
  ExternalLink, Users, ChevronRight, ChevronDown, Loader2,
  AlertTriangle, X, Zap, Bookmark, BookmarkCheck, Copy, Check, Heart, MessageSquare,
  Plus, GitMerge, Layers, Flag, FileText, MousePointer2, Download, FileJson,
  Landmark, Star, Route,
} from "lucide-react";
import { Link } from "wouter";

// ─── Known entity labels ──────────────────────────────────────────────────────
// "dag-team" = DAG official entities (DOR Metagraph, DTM, Team Foundation, Treasury,
//   Validator Tax Pool, Reward Pool). They are LABELLED PROMINENTLY and highlighted in
//   reports, but they DO count as private commingling evidence (unlike exchange/bridge/genesis).
const KNOWN_LABELS: Record<string, { label: string; type: "exchange" | "genesis" | "defi" | "flagged" | "bridge" | "dag-team" | "official" }> = {
  // ── XRP ────────────────────────────────────────────────────────────────────
  rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh: { label: "XRP Genesis",     type: "genesis" },
  r3kmLJN5D28dHuH8vZNUZpMC4JPgrKQBkR: { label: "Ripple Inc.",      type: "genesis" },
  r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59: { label: "Ripple Cold 1",   type: "genesis" },
  rHb9CJAWyB4uj91VRWn96DkukG4bwdtyTh: { label: "Ripple Cold 2",   type: "genesis" },
  rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh: { label: "Bitstamp XRP",    type: "exchange" },
  rMQ98K56yXJbDGv49ZSmW51sLn94Xe1mu1: { label: "Bitstamp XRP 2",  type: "exchange" },
  rG6FZ31hDHN1K5Dkbma3PSB5uVCuVVRzfn: { label: "Bitfinex XRP",    type: "exchange" },
  rBndiPPKs9k5rjBb7HsEiqXKVZ9MMhGmhM: { label: "Kraken XRP",      type: "exchange" },
  rKmBGxocj9Abgy25J51Mk1iqFzW9aVF9Tc: { label: "Kraken XRP 2",    type: "exchange" },
  rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh: { label: "Kraken XRP 3",    type: "exchange" },
  rBx5RkPh2KR3JqBtZWoU25ZxGHaJzYMD84: { label: "Kraken XRP 4",    type: "exchange" },
  rBKPS4oLSaV2KVVuHH8EpQqMGgWj5U37h4: { label: "Bittrex XRP",     type: "exchange" },
  rPJwJUmDMijFtBi3GnW2VRFTCEpFCJCGPA: { label: "Poloniex XRP",    type: "exchange" },
  rrpNnNLKrartuEqfJGpqyDwPj1BBN1ybNn: { label: "Binance XRP",      type: "exchange" },
  rBttd61FExHC68vsZ8dqmS3DfjFEceA1A:  { label: "Binance XRP 2",   type: "exchange" },
  rHXuEaRYnnJom5RS9K5pMrfFSmXwcjALBF: { label: "Coinbase XRP",     type: "exchange" },
  rw2ciyaNshpHe7bCHo4bRWq6pqqynnWKQg: { label: "Coinbase XRP 2",  type: "exchange" },
  rwnYLUsoBQX3ECa1A5bSKLdbPoHKnqf63J: { label: "Coinbase XRP 3",  type: "exchange" },
  r4sRyacXpbh4HbagmgfoQq8Q3j8ZJzbZ1J: { label: "Coinbase XRP 4",  type: "exchange" },
  rwpTh9DDa52XkM9nTKp2QrJuCGV5d1mQVP: { label: "Coinbase XRP 5",  type: "exchange" },
  rwpTh9DDa52XKm9nTKp2QrJuCGV5d1mQVP: { label: "Coinbase XRP 5b", type: "exchange" },
  r3YsZdkznVzYBv141qhwXHDWoPUXLdksNw: { label: "Coinbase XRP 6",  type: "exchange" },
  rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w: { label: "Coinbase XRP 7",  type: "exchange" },
  rUjfTQpvBr6wsGGxMw6sRmRQGG76nvp8Ln: { label: "Coinbase XRP 8",  type: "exchange" },
  r3wcwBpVCGcKu7TzY1ta2kQiJ5UHECDFZS: { label: "Coinbase XRP 9",  type: "exchange" },
  rayCEqaUBryJSWxf3BEc1Y4EMRYLuK3aJ8: { label: "Coinbase XRP 10", type: "exchange" },
  r7BspkyEZqKZ88SovgxZtsGGxoVoPodJf:  { label: "Coinbase XRP 11", type: "exchange" },
  rGFNBYb9548VqJojTDoDDYoJBEpvmVywSV: { label: "Coinbase XRP 12", type: "exchange" },
  rQGXuQCZH27mj7wcikYrKCEbAh5xfenwb8: { label: "Coinbase XRP 13", type: "exchange" },
  r4k4U4Hge3mLfyURfGu3pJFeNTWXduBha2: { label: "Coinbase XRP 14", type: "exchange" },
  rGvmcMqafc5HAdyhaoQCG4tpBZKdYLT3cH: { label: "Coinbase XRP 15", type: "exchange" },
  rHRHwHJHHzQ328c33wCimeXqCgyDoxLXjF: { label: "Coinbase XRP 16", type: "exchange" },
  rJb5KsHsDHF1YS5B5DU6QCkH5NsPaKQTcy: { label: "OKX XRP",         type: "exchange" },
  rUzWJkXyEtT8ekSSxkBYPqCvHpngcy6Fks: { label: "OKX XRP 2",       type: "exchange" },
  rPVMhWBsfF9iMXYj3aAzJVkPDTFNSyWdKy: { label: "Huobi XRP",       type: "exchange" },
  rHpSX1VNr3tdsDvvSAFKMPXzTZ3KPAJQ2E: { label: "HTX XRP",         type: "exchange" },
  rDm691szLmEqpUbXmgnj159Ffpp9PntHwj: { label: "HTX XRP 2",       type: "exchange" },
  r4FuDeXifHAZork5KcEQKKBqmBWPGiFmJC: { label: "Uphold XRP",      type: "exchange" },
  rMdG3ju8pgyVh29ELPWaDuA74CpWW6Fxns: { label: "Uphold XRP 2",    type: "exchange" },
  rsXT3AQqhHDusFs3nQQuwcA1yXRLZJAXKw: { label: "Uphold XRP 3",    type: "exchange" },
  raBQUYdAhnnojJQ6Xi3eXztZ74ot24RDq1: { label: "Gemini XRP",      type: "exchange" },
  rKNwXQh9GMjaU8uTqKLECsqyib47g5dMvo: { label: "Crypto.com XRP",  type: "exchange" },
  rGFuMiw48HdbnrUbkRToR1yMBZkjbqvUhQ: { label: "MEXC XRP",        type: "exchange" },
  rHcFoo6a9qT5NHiVn1THwuhbekk8ovtWiL: { label: "Bybit XRP",       type: "exchange" },
  rNxp4h8apvRis6mJf9Sh8C6iRxfrDWN7AV: { label: "KuCoin XRP",      type: "exchange" },
  rGsxGQNdaDyFhZQ5JqDGPkT3VGFFexCaM3: { label: "Gate.io XRP",     type: "exchange" },
  rGmP2iRHqoYkFXF3HqrZEGZVXiqBGKcZmz: { label: "Gate.io XRP 2",   type: "exchange" },
  rMJXDzU1N9ZSDzPF7s1i2GGKyjM2wB3iom: { label: "Robinhood XRP",   type: "exchange" },
  rN7n3473SaZBCG4dFL75EpTSMBKmFVBQBh: { label: "Bitget XRP",           type: "exchange" },
  rBWpYJhuJWBPakzJ4kYQqHShSkkF3rgeD:  { label: "Cobo Custody XRP",     type: "exchange" },
  rQrgppDZMMKeq1x9gDuoytWeRLmLfXYV3q: { label: "Union Chain XRP",      type: "exchange" },
  rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De: { label: "Ripple RLUSD Issuer",  type: "exchange" },
  rwPJqrGioKpieFx3MsbiySfrrFqt2PzUDN: { label: "Coinbase",             type: "exchange" },
  rUrriLdQ4q6fPbjiyo5zGHY5NFdUzJr13TM: { label: "Coinbase",            type: "exchange" },
  rDdkHrHMqFPFqUew2WCxPhS5JR6Gmh755RS: { label: "Coinbase",            type: "exchange" },
  rGwCvT1vFDxsj6WWV55jBYxzXduyiPnVwZ: { label: "Coinbase",             type: "exchange" },
  rD2yXXhio7QdkQ2Nx59MkRCw1w7Mq3NBSa: { label: "Coinbase",             type: "exchange" },
  rLWajfrUR6htxdzyl7XAZ7TS51Dds8XTT8: { label: "Coinbase",             type: "exchange" },
  rBDSYHx4xKZvWvBR9kGeVnWEFEb8ir7Gfm: { label: "Coinbase",             type: "exchange" },
  rHo7znRYDpeBJoMzcMMZfV6r8ML4hPeCDR: { label: "Coinbase",             type: "exchange" },
  rGct8a15zHDuCobXWMja4FNI47TcJ6DoB5: { label: "Coinbase",             type: "exchange" },
  rUs9dv67xMdFs2mdtCnK7tKHbtcJvy7Pu9: { label: "Coinbase",             type: "exchange" },
  rXypYS18H9sh9v3582dmZuuw18hgWEVFg: { label: "Coinbase",               type: "exchange" },
  rMvaKYzHpaZGUUSRX1iJbnqKV2iG9gmjTH: { label: "Coinbase",             type: "exchange" },
  rsZ1kdivRkXwqY4Ws69HeRRGjgJtmaqKaR: { label: "Coinbase",             type: "exchange" },
  rpyLCHeFs897rYKTMAzSRKrMGhRK6GUrri: { label: "Coinbase",             type: "exchange" },
  rDfKzRSdXacYfFbVLfi7xBLFRXkCyNvMme: { label: "Coinbase",             type: "exchange" },
  r4Gyb9xhG4iLrsR6Ac9dcHTjZLekJcXW2V: { label: "Coinbase",             type: "exchange" },
  rLWDu4tEhtBaLDYNtjALT21hdhwX8f9vNK: { label: "Coinbase",             type: "exchange" },
  rnjXFUfKCtBBYDTK1GCYbJL6V9WCqRGdEr: { label: "Coinbase",             type: "exchange" },
  rwPet7Vu3yaBuwMgFYG521mSat1qkkwsLE: { label: "Coinbase",              type: "exchange" },
  r4VDPS5yatqpkdBoJxNWh3TWWXTmR62r: { label: "Coinbase",                type: "exchange" },
  rpMaupvHx4jcfgpd58VdLVR7g6XjhnUtXg: { label: "Coinbase",             type: "exchange" },
  rNCfaHmv2QLs6du9r25KTsZpdsyWQAquTd: { label: "Coinbase",             type: "exchange" },
  rKzfrk1RsUxWmHimWyNwk8AoWHoFneu4m: { label: "Uphold",                type: "exchange" },
  rBEc94rUFfLfTDwwGN7rQGBHc883c2QHhx: { label: "Uphold",               type: "exchange" },
  rsX8cp4aj9grKVD9V1K2ouUbxgYsigUtBL: { label: "Uphold",               type: "exchange" },
  rEvuKRoEBzSbM5k5Qe5tD9BixZXsfxkHf: { label: "Kraken",                type: "exchange" },
  rUeDDFNp2q7Ymvyv75hFGC8DAcygVyJbNF: { label: "Kraken",                type: "exchange" },
  r4DymtkgUAH2wqRxVfdd3Xtswzim6eC6c5: { label: "Crypto.com",           type: "exchange" },
  rKV8HEL3vLc6q9waTJcewdRdSFyx67QFb: { label: "Crypto.com",            type: "exchange" },
  rJmXYcKCGJSayp4sAdp6Eo4CdSFtDVv7WG: { label: "Crypto.com",           type: "exchange" },
  rEeWEp88cpKUddkKk37B2EZeiHGBiBXY3: { label: "Binance.US",             type: "exchange" },
  rMvYS27SYs5dXfdsUgpvv1CSrPsCz7ePF5: { label: "Binance.US",           type: "exchange" },
  // ── XLM (Stellar) ──────────────────────────────────────────────────────────
  GDDEAH46MNFO6JD7NTQ5FWJBC4ZSA47YEK3RKFHQWADYTS6NDVD5NZN: { label: "Binance XLM",     type: "exchange" },
  GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN: { label: "Binance XLM 2",   type: "exchange" },
  GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN: { label: "Coinbase XLM",    type: "exchange" },
  GA3CINHTGMUMRVPJPVHYJWQJ2EF7EX2PCRAFN4H4ZPO77WB6RHXEHMJT: { label: "Coinbase XLM 2", type: "exchange" },
  GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37: { label: "Coinbase XLM 3", type: "exchange" },
  GDT7ARDYZRBXXYOCSQ3MUMISTITSSRWZI6KR2A5L5Q3KB4QIZHGYMTIH: { label: "Bybit XLM 3",     type: "exchange" },
  GCGMJ63NTBSQKW7OEQ3J2RZH6PYXSTEUK4TVE35IPXLB7XWNI2PUDCY6: { label: "Uphold XLM 6",    type: "exchange" },
  GDUQXQAR4ECNAYCTGZAS4TH4KJJIZDLXPR5V2YYRFRGGQ3LTXBFTBVW6: { label: "Coinbase XLM 6", type: "exchange" },
  GDF4UGQSY6VHWN7T4XJEZ6WYJEREMZYLNYZ5CCKYVS3V3MNYIBMTB354: { label: "Coinbase XLM 7",  type: "exchange" },
  GCIL6JNOVODHIZGZBYKWSRDRYUVXWF5ZEVMISJQQJBQRMF5FAH6YOD7U: { label: "Coinbase XLM 8",  type: "exchange" },
  GCVEON7LARMBNCCJCYLXO4FNFENL6R74NWCC2V6YZN5Z6L5W4GUZDMWC: { label: "Coinbase XLM 9",  type: "exchange" },
  GDS2WFLIJID6BDM64FGUD7MNOVZUEWHJ5VJPO2GQ32KOZCYIYIRIQTG6: { label: "Coinbase XLM 10", type: "exchange" },
  GDZHDOITT5W2S35LVJZRLUAUXLU7UEDEAN4R7O4VA5FFGKG7RHC4NPSC: { label: "Coinbase XLM 11", type: "exchange" },
  GBRSO2HPPEHCZASU3W3ZDMS7ISWPWJZB7IJ4JPFLZMKN7VOTWUCT3SL6: { label: "Coinbase XLM 12", type: "exchange" },
  GB5FUSCVVV7ZLKJVL7FRCSBQHZXYLMSWWXXYC7NH35GV57S5XWKEVA4V: { label: "Coinbase XLM 13", type: "exchange" },
  GANZM2JP5ZFHI2UZCFTK5OAPLJJVEWRKCLGJD5RTAI7WRTHX6OB6O6CC: { label: "Coinbase XLM 14", type: "exchange" },
  GDTYD6BWWZIOHD2PPLTFQYW3KVTT5YEF2EVWMTUJTVGQ4U2UBKFHHVYN: { label: "Coinbase XLM 15", type: "exchange" },
  GA5XIGA5C7QTPTWXQHY6T19HSGZDQXPKFBM7NZQND4KHZFVU5HY6KKK: { label: "Kraken XLM",      type: "exchange" },
  GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM: { label: "Kraken XLM 2",    type: "exchange" },
  GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S: { label: "Bitstamp XLM",     type: "exchange" },
  GBVOL67TMUQBGL4TZYNMY3ZQ5WGQYFPFD5VJRWXR72VA33VFNL225PL: { label: "Huobi XLM",        type: "exchange" },
  GBZ35ZJRIKJGYH5PBKLKOZ5L5GQXCDIARHV3LIJEV7MIRUCQIRLVVB6: { label: "Bitfinex XLM",     type: "exchange" },
  GCGNWKCJ3KHRLPM3TM6N7D3W5YKDJFL6A2YCXFXNMRTZ4Q66MEMGHMN: { label: "OKX XLM",          type: "exchange" },
  GDKIJJIKXLOM2NRMPNQZUUYK24ZPVFC6426GZAEP3KUK6KEJLACCWNMX: { label: "MEXC XLM",         type: "exchange" },
  GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4: { label: "Uphold XLM",       type: "exchange" },
  GBJDVTWUXRNDK35X7A6XYHB2XYXEM7XRH776KK6VYOYY5JL2PJCZPZ3O:  { label: "Uphold XLM 2",      type: "exchange" },
  GBJDVTTWUXRNDK35X7A6XYHB2XYXEM7XRH776KK6VYOYY5JL2PJCZPZ3O: { label: "Uphold XLM Cold",   type: "exchange" },
  GBW5AENWI5PFJRYEIAIRYDB62MVEHDYHEBXKFN3TI64RSL2L6GYOYFG4: { label: "Uphold XLM 3",    type: "exchange" },
  GDMKMOHKKYS4VTHBCH4TZXNFF7MK7KDA7IEZL6NB36JREVCRNYZJXPTA: { label: "Uphold XLM 4",    type: "exchange" },
  GBP32F37ZHXGSLOE4WAFCLNWQUMY4OUIAUGNBZUF4OD2BG6MS7WKRTSX: { label: "Uphold XLM 5",    type: "exchange" },
  GCNSGHUCG5VMGLT5RIYYZSO7VQULQKAJ62QA7EC7KH6X7HJR3BXCRRY: { label: "KuCoin XLM",       type: "exchange" },
  GBEZDAOKKUDLLNR4EGZFGLCDBQBQLQCQS72LKRNKRUAWPDBPXJVBJV74: { label: "KuCoin XLM 2",     type: "exchange" },
  GBUQWP3BOUZX34TOND2QV7QQ7K7VJTM6DBYRD3UI1FAB6B5OKKWKFKP: { label: "Bybit XLM",        type: "exchange" },
  GBDUXW4E5WRM5EM6UXBLE7Y5XGSXJX472BSSBPKFPQ3PJCJHRIA6SH4C: { label: "Bybit XLM 2",     type: "exchange" },
  GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGCFY9QQGDPFHD1N0PQEN:   { label: "Gate.io XLM",     type: "exchange" },
  GBSTRUSD7IRX73RQZBL3RQUH6KS3O4NYFY3QCALDLZD77XMZOPWAVTUK: { label: "Crypto.com XLM",  type: "exchange" },
  GDKLYAQTME4MVGCVPQBXSXVMQKGRKDTNF7FIOAJQWNC4GQVPZARQKLE:  { label: "Bitget XLM",      type: "exchange" },
  GB2ES2N326MZK4EGJBKN3ZARCQ5RTFQSAWIJAAKFVIIIJSCC35TXIMLB: { label: "Robinhood XLM",    type: "exchange" },
  GB67TJFJO3GUA432EJ4JTODHFYSBTM44P4XQCDOFTXJNNPV2UKUJYVBF: { label: "Crypto.com",        type: "exchange" },
  GBF6SZEZ4AJY7BCBUV3ZYJ3Q27YMO4NJU6IZQP7ODY47MPVFWCO24SNW: { label: "Blockchain.com",    type: "exchange" },
  GARAR5QR7WRL24MQMSO4INWV7C5SE4EE2YVXTLD6ORONYFHSUAGZYSLN: { label: "Blockchain.com",          type: "exchange" },
  GBBALM76B5OUPOZCMFCNT5PVIFV3WTUYX3VVGC7FMN4ZPQLGCG2C4X3D: { label: "Kraken",                 type: "exchange" },
  GBXCM6MHKWZR7DYIBHZZAXXV6CYTGAROIXISAW3PQM7L3J7LTY5ORHHO: { label: "Kraken Cold Storage Wallet", type: "exchange" },
  GAQZU7Y7GB3E4XOA3ZXEZDOTIEIWQRYOAIVJ6STY2YTUQAGZL3GYJCXG: { label: "Kraken",                          type: "exchange" },
  GB6DQO6LDNGANIWKPA4E5Y6GRRFAP56Y2N3BIU54JQ3NT66L53RZCOM5: { label: "Kraken Cold Wallet",              type: "exchange" },
  GCDBX7GTQWJFTAJCJUGV4KXJZE6Q527YRLW75GYDJ2ODSVBOXCS4W7VS: { label: "MEXC",                            type: "exchange" },
  GAV6J5L473K4H6226IFNCAL7E5A2PR63YRCZDYJPTQH3S35YODXUUADV: { label: "Coinbase",                        type: "exchange" },
  GCR5X5Z7ETS4DLGPMBD6BGCBO5QZIL2O3CLKLGE6NEH5L55FDZFFLXFD: { label: "Coinbase",                        type: "exchange" },
  GCFN6RGQLZXK4XTIL524EXXAFHTAQMNEEI5P5VBWDME5JEXPNSVTIH3V: { label: "Coinbase",                        type: "exchange" },
  GCVLELPP5ZIDS6B4VFVZDNUEIGAYSRH3QHFJUO75XSCK3RSBY5FEXJ5N: { label: "Coinbase",                        type: "exchange" },
  GC5PFAXPL3BYIRHLMUFD3E353DINA6A52DXJIXLKQEVO2GA7WFWGWCFS: { label: "Coinbase",                        type: "exchange" },
  GBOYDKMW7MKSXV3UAPTEWVF3IX2EIJ4YOCEH6MOO5XTYOJKIH73YESVB: { label: "Coinbase",                        type: "exchange" },
  GB5CLRWUCBQ6DFK2LR5ZMWJ7QCVEB3XKMPTQUYCDIYB4DRZJBEW6M26D: { label: "Coinbase",                        type: "exchange" },
  GC23BCI644P66PPNRGRMKFFVQZZXE3CSCGMFIYFV5OW4WCPM2XICKWQZ: { label: "Coinbase",                        type: "exchange" },
  GCETHWILKC242GHWHCYAI4VAU4D4JZ637XHCAEABW6EVWWDILXNRMPJF: { label: "Binance",                         type: "exchange" },
  GC5LF63GRVIT5ZXXCXLPI3RX2YXKJQFZVBSAO6AUELN3YIMSWPD6Z6FH: { label: "Binance",                        type: "exchange" },
  GDHF3HIKWM5KJAVLZBSZWUFDOEOT7IBMY22UXG4QBE326O354INLPAND: { label: "Binance",                         type: "exchange" },
  GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6: { label: "Binance",                        type: "exchange" },
  GBAIA5U6E3FSRUW55AXACIVGX2QR5JYAS74OWLED3S22EGXVYEHPLGPA: { label: "Binance",                         type: "exchange" },
  GDUST544JNATIO2VI3L7LXHVJFZXNYRWIKNMGRV2RZFZOOBE635SEI4C: { label: "Bitrue",                          type: "exchange" },
  GAWPTHY6233GRWZZ7JXDMVXDUDCVQVVQ2SXCSTG3R3CNP5LQPDAHNBKL: { label: "Bitfinex",                      type: "exchange" },
  GDBK3AHPQ7AO2U7JYEBFGJ2PBDVVFANHH4NQANDX6Q4GZ266WZ3IOIXN: { label: "Bitstamp",                      type: "exchange" },
  GA3NTBDIKQVDDM6ZDKJLGXJFESWJ636AGRIW34RH5WL24LUMX3YASKX2: { label: "Bitstamp",                       type: "exchange" },
  GBC6NRTTQLRCABQHIR5J4R4YDJWFWRAO4ZRQIM2SVI5GSIZ2HZ42RINW: { label: "Gate.io",                        type: "exchange" },
  GDBIXGZ3EKI3M4DBM65ADLHVNYIOG7JXGOHW5DHUZQAXPORY3QNO2PNY: { label: "ChangeNOW",                      type: "exchange" },
  GAJ4BSGJE6UQHZAZ5U5IUOABPDCYPKPS3RFS2NVNGFGFXGVQDLBQJW2P: { label: "KuCoin",                         type: "exchange" },
  GBGII2C7M4TOEC2MVAZYG3TRFM3ATCCEWANSN4Q3AHEX3NRKXJCVZDEV: { label: "OKEx",                            type: "exchange" },
  GB3RMPTL47E4ULVANHBNCXSXM2ZA5JFY5ISDRERPCXNJUDEO73QFZUNK: { label: "CEX.IO",                          type: "exchange" },
  GBW64JT24G4M2FTXVDKJOEQDSBLULXALEYY6VPEJIEN4NTFGMW35BPP5: { label: "Bitvavo",                        type: "exchange" },
  GAFK7XFZHMLSNV7OJTBO7BAIZA66X6QIBV5RMZZYXK4Q7ZSO52J5C3WQ: { label: "Centre",                         type: "exchange" },
  GAKGC35HMNB7A3Q2V5SQU6VJC2JFTZB6I7ZW77SJSMRCOX2ZFBGJOCHH: { label: "SDF Direct Development 2",       type: "genesis" },
  GATL3ETTZ3XDGFXX2ELPIKCZL7S5D2HY3VK4T7LRPD6DW5JOLAEZSZBA: { label: "SDF Direct Development",         type: "genesis" },
  GAPV2C4BTHXPL2IVYDXJ5PUU7Q3LAXU7OAQDP7KVYHLCNM2JTAJNOQQI: { label: "SDF Direct Development",        type: "genesis" },
  GB6NVEN5HSUBKMYCE5ZOWSK5K23TBWRUQLZY3KNMXUZ3AQ2ESC4MY4AQ: { label: "SDF Direct Development",          type: "genesis" },
  GDWXQOTIIDO2EUK4DIGIBLEHLME2IAJRNU6JDFS5B2ZTND65P7J36WQZ: { label: "SDF Product and Innovation Wallet", type: "genesis" },
  GDUY7J7A33TQWOSOQGDO776GGLM3UQERL4J3SPT56F6YS4ID7MLDERI4: { label: "SDF Growth Wallet",               type: "genesis" },
  GC3ITNZSVVPOWZ5BU7S64XKNI5VPTRSBEXXLS67V4K6LEUETWBMTE7IH: { label: "SDF Growth Wallet",               type: "genesis" },
  GCVJDBALC2RQFLD2HYGQGWNFZBCOD2CPOTN3LE7FWRZ44H2WRAVZLFCU: { label: "SDF Growth Wallet",               type: "genesis" },
  GCPWKVQNLDPD4RNP5CAXME4BEDTKSSYRR4MMEL4KG65NEGCOGNJW7QI2: { label: "SDF Product and Innovation Wallet", type: "genesis" },
  GAMGGUQKKJ637ILVDOSCT5X7HYSZDUPGXSUW67B2UKMG2HEN5TPWN3LQ: { label: "SDF Assets and Liquidity Wallet", type: "genesis" },
  GBEVKAYIPWC5AQT6D4N7FC3XGKRRBMPCAMTO3QZWMHHACLHTMAHAM2TP: { label: "SDF Growth Wallet",               type: "genesis" },
  GA6D2S6XDBT7WZIZNDGUBLXUGDAGLZGZ2SYT2JLXD4BB2W76XS66FZ2S: { label: "SDF Early Employee Grants Wallet", type: "genesis" },
  // ── HBAR (Hedera) ──────────────────────────────────────────────────────────
  "0.0.23576":   { label: "Binance HBAR",    type: "exchange" },
  "0.0.34140":   { label: "Binance HBAR 2",  type: "exchange" },
  "0.0.726513":  { label: "OKX HBAR",        type: "exchange" },
  "0.0.3664683": { label: "Coinbase HBAR",   type: "exchange" },
  "0.0.1649540": { label: "KuCoin HBAR",     type: "exchange" },
  "0.0.3014985": { label: "Bybit HBAR",      type: "exchange" },
  "0.0.2764670": { label: "Uphold HBAR",     type: "exchange" },
  "0.0.1147432": { label: "Kraken HBAR",     type: "exchange" },
  "0.0.2574696": { label: "Gate.io HBAR",    type: "exchange" },
  "0.0.4352618": { label: "Bitget HBAR",     type: "exchange" },
  "0.0.3396073": { label: "HTX HBAR",        type: "exchange" },
  "0.0.38674":   { label: "Binance.US",      type: "exchange" },
  "0.0.38675":   { label: "Binance.US 2",    type: "exchange" },
  "0.0.956030":  { label: "Coinbase",        type: "exchange" },
  "0.0.106202":  { label: "Kraken",          type: "exchange" },
  "0.0.1042784": { label: "Robinhood",       type: "exchange" },
  "0.0.372889":  { label: "Bitstamp",        type: "exchange" },
  "0.0.5094":    { label: "Hedera Foundation",    type: "genesis" },
  "0.0.98":      { label: "Hedera Fee Collector",  type: "genesis" },
  "0.0.800":     { label: "Hedera Rewards",         type: "genesis" },
  "0.0.801":     { label: "Hedera Staking",          type: "genesis" },
  // ── XDC (XinFin) ───────────────────────────────────────────────────────────
  xdc1c5808a8c6a24dd5e9d7af4c1bb92e3a7fcb5f55: { label: "Bitrue XDC",    type: "exchange" },
  xdcadf8f46f6d9b480e1f91c02c0cAfec9d37d3aa:   { label: "AscendEX XDC",  type: "exchange" },
  xdc4a62f8ceEF3F2ea81E32e0EAce2e16e8c8BEbC54: { label: "KuCoin XDC",    type: "exchange" },
  xdc2a0f8B4D3ac1D66a72A0e29eCFd60b79Fe54f7Cc: { label: "Gate.io XDC",   type: "exchange" },
  xdc0bdf7ED8a08e99aBb3acB37fEc88bF01DB4fcbae: { label: "Bitrue XDC 2",  type: "exchange" },
  xdc15adad47B4Cd4b14fB8B3FaF8Fd02DF62a3cE8Dc: { label: "OKX XDC",      type: "exchange" },
  // ── Ethereum / EVM ─────────────────────────────────────────────────────────
  "0x28c6c06298d514db089934071355e5743bf21d60": { label: "Binance Hot",    type: "exchange" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { label: "Binance Cold",   type: "exchange" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { label: "Binance 2",      type: "exchange" },
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": { label: "Binance Cold 3", type: "exchange" },
  "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": { label: "Binance Legacy", type: "exchange" },
  "0xf977814e90da44bfa03b6295a0616a897441acec": { label: "Binance 5",      type: "exchange" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { label: "Coinbase Hot",   type: "exchange" },
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": { label: "Coinbase 2",     type: "exchange" },
  "0x503828976d22510aad0201ac7ec88293211d23da": { label: "Coinbase 3",     type: "exchange" },
  "0xd688aea8f7d450909adeb20364e860db13647ed7": { label: "Coinbase 4",     type: "exchange" },
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": { label: "Kraken ETH",     type: "exchange" },
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": { label: "Kraken 2",       type: "exchange" },
  "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13": { label: "Kraken 3",       type: "exchange" },
  "0xf30ba13e4b04ce5dc4d254ae5fa95477800f0eb0": { label: "Kraken ETH 4",   type: "exchange" },
  "0x0681d8db095565fe8a346fa0277bffde9c0edbbf": { label: "OKX Hot",        type: "exchange" },
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": { label: "OKX 2",          type: "exchange" },
  "0xe93381fb4c4f14bda253907b18fad305d799241a": { label: "Huobi 1",        type: "exchange" },
  "0x46705dfff24256421a05d056c29e81bdc09723b8": { label: "Huobi 2",        type: "exchange" },
  "0xab5c66752a9e8167967685f1450532fb96d5d24f": { label: "Huobi 3",        type: "exchange" },
  "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec": { label: "MEXC ETH",       type: "exchange" },
  "0x4fdaf3ef3af2b3c3b4e5f94c0e6d70fed7b3c830": { label: "Bybit ETH",      type: "exchange" },
  "0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23": { label: "Bybit ETH 2",    type: "exchange" },
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": { label: "Gate.io ETH",    type: "exchange" },
  "0x7793cd85c11a924478d358d49b05b37b91ab9d79": { label: "Gate.io ETH 2",  type: "exchange" },
  "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2": { label: "FTX (defunct)",  type: "flagged" },
  "0xc098b2a3aa256d2140208c3de6543aaef5cd3a94": { label: "FTX US (defunct)", type: "flagged" },
  // ── Bitcoin ────────────────────────────────────────────────────────────────
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": { label: "Binance BTC Hot",  type: "exchange" },
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": { label: "Binance BTC Cold", type: "exchange" },
  "bc1qgdjqv0av3q56jvd82tkdjpy7gd6f0tdn5n8vy5": { label: "BitMEX BTC",    type: "exchange" },
  "3E35SFZkfLMGo4qX5aVs1iBnpEiFLSZmBP":          { label: "Kraken BTC",    type: "exchange" },
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": { label: "Coinbase BTC",  type: "exchange" },
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS":          { label: "Bitstamp BTC",  type: "exchange" },
  "1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd":          { label: "Huobi BTC Cold", type: "exchange" },
  "1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ":           { label: "OKX BTC",       type: "exchange" },
  "3QW95MafXv9SqkXxhpKBgqXCgVzugdwsGt":          { label: "Bybit BTC",     type: "exchange" },
  "385cR5DM96n1HvBDMDc1XnYedsFZa8zT4T":           { label: "Bitfinex BTC",  type: "exchange" },
  "1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC":           { label: "Huobi BTC 2",   type: "exchange" },
  "bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6": { label: "Robinhood BTC", type: "exchange" },
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh": { label: "Binance BTC 2",  type: "exchange" },
  "1Bh2AAQCnSiXqJWTGVTTTVMFAFPjguegYZ":           { label: "Gate.io BTC",   type: "exchange" },
  "1GR9qNz7zgtaW5HwwVpEJWMnGWhsbsieCG":           { label: "MEXC BTC",      type: "exchange" },
  // ── DAG (Constellation Network) ────────────────────────────────────────────
  // ── DAG Official Entities (type "official") ────────────────────────────────
  // Labelled in reports; count as PRIVATE COMMINGLING (not excluded like exchanges).
  // Team Foundation
  DAG38whfr5CWzMoQg8PajuiukNNojySqyXtZdBhK: { label: "Team Foundation Wallet",    type: "official" },
  DAG7teqwiZjuBivJi7Mx8AkhwnF6w3Q1poUTCViK: { label: "Team Foundation Wallet",    type: "official" },
  DAG7uFTujXArFTuTqELGYGcthacpfQykBX7wsgFv: { label: "Team Foundation Wallet",    type: "official" },
  DAG8MWCDLPxjufRE2tkg3qpWSd7iJKFfsg9H5nCE: { label: "Team Foundation Wallet",    type: "official" },
  DAG2eFDjZ2CMA3M4KMfLw6Vnn7kaJPJqcSCpHU25: { label: "Team Foundation Wallet",    type: "official" },
  DAG2ttEXvYHsMP5qu7ejoBTbuCPmHoDhU5fZi3YL: { label: "Team Foundation Wallet",    type: "official" },
  DAG1ZieMRm7ALEbSjmvwztvtZYu7srPaXwxbC14U: { label: "Team Foundation Wallet",    type: "official" },
  // Stardust Collective
  DAG8vD8BUhCpTnYXEadQVGhHjgxEZZiafbzwmKKh: { label: "Stardust Collective Wallet", type: "official" },
  DAG8VT7bxjs1XXBAzJGYJDaeyNxuThikHeUTp9XY: { label: "Stardust Collective Wallet", type: "official" },
  DAG6qyCvhka9rX9SsAMouHmAoKmADuGW415anB59: { label: "Stardust Collective Wallet", type: "official" },
  // DOR Metagraph
  DAG0o6WSyvc7XfzujwJB1e25mfyzgXoLYDD6wqnk: { label: "DOR Metagraph",             type: "official" },
  DAG4nBD5J3Pr2uHgtS1sa16PqemHrwCcvjdR31Xe: { label: "DOR Metagraph",             type: "official" },
  DAG4YD6rkExLwYyAZzwjYJMxe36PAptKuUKq9uc7: { label: "DOR Metagraph",             type: "official" },
  DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM: { label: "DOR Metagraph",             type: "official" },
  DAG5fqiGq9L5iLH5R5eV7gBjkucewrcaQ1jVnKYD: { label: "DOR Metagraph",             type: "official" },
  DAG5uDuGhPuh4mQZGNLFCEcdy69txSF4iSfFbdWJ: { label: "DOR Metagraph",             type: "official" },
  DAG6B5mBMoEu3Habtb2ts3QGUD2UquywrQSLSubU: { label: "DOR Metagraph",             type: "official" },
  // DOR Validator Tax
  DAG045Bmio7Jrv3aErTKjAisRnpBKvp16pp1wSqT: { label: "DOR Validator Tax Pool",    type: "official" },
  DAG2JsH1QKj8LrzmcgX2pf9MAcdhQWuihYnZMUNW: { label: "DOR Validator Tax",         type: "official" },
  // DTM Enterprise
  DAG8s4uKsTKV5hNVv9oHWophX1CYKVqJ88hM9MZE: { label: "DTM Enterprise Wallet",     type: "official" },
  DAG06pFXdTtqrx2H11oHyH5rBe6Ccx7XG8WSsPSA: { label: "DTM Enterprise Wallet",     type: "official" },
  // DTM Reward Pool
  DAG0U7R9jXMSiNMU5mgqpvCVuaBwfRBzY77nJZM1: { label: "DTM Reward Pool",           type: "official" },
  DAG0Njmo6JZ3FhkLsipJSppepUHPuTXcSifARfvK: { label: "DTM Reward Pool",           type: "official" },
  // PylonFi DOR Node
  DAG7k3M5aAWdV3S3E5nZXvvQyGprkYbVKxz6gGRS: { label: "PylonFi DOR Node",              type: "official" },
  // Constellation Protocol
  DAG86Joz5S7hkL8N9yqTuVs5vo1bzQLwF3MUTUMX: { label: "Constellation Protocol Wallet", type: "official" },
  // Legacy Stardust / Team entries (not yet reclassified)
  DAG8UsoSR14peffVJKAsf3mqJFnkKSoQEUQDAQKN: { label: "[Stardust Team Foundation]", type: "dag-team" },
  DAG07znCvSyM2xhxPZECrGhVF6WVPMvFWe6Z6EWW: { label: "[Stardust Team Fdn 2]",     type: "dag-team" },
  DAG3yzY9252n8Fkxix7pZo5TH6F9paxSVLsDARK4: { label: "[Stardust Team Fdn 7]",     type: "dag-team" },
  // Treasury
  DAG3tC21XtXvoUD8hTMQzHm7T21MHahuFPVrPBtR: { label: "[DAG Treasury]",            type: "dag-team" },
  DAG1nw5WkZdQf96Df3PkrjLxeHj2EV3oLkWPZQcD: { label: "[DAG Treasury 2]",          type: "dag-team" },
  // Bridge / Infrastructure (DAG only)
  DAG3pBTP4AKQQa6Vpbk59Np7MVa7ogToqujCKa1B: { label: "Official Bridge / Base Wallet", type: "official" },
  DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz: { label: "DAG Reward / Team Wallet",      type: "genesis"  },
  // DAG Exchanges
  DAG6Yxge8Tzd8DJDJeL4hMLntnhheHGR4DYSPQvf: { label: "MEXC DAG",        type: "exchange" },
  DAG4TETUwraLYX1mYdC8ymUxxWsoNZPffUpDf4Ar: { label: "Gate.io DAG",      type: "exchange" },
  DAG3Lcv4GEhPH34VHVgbEAf21Y3L2rtjLpXh7QD4: { label: "CoinEX DAG",       type: "exchange" },
  DAG6cStT1VYZdUhpoME23U5zbTveYq78tj7EihFV: { label: "KuCoin DAG",       type: "exchange" },
  DAG5yqn4JRkW5oAMthhBayBtkZzfAvRQnkH1dCG4: { label: "KuCoin DAG 2",     type: "exchange" },
  DAG2rMPHX4w1cMMjowmewRMjD1in53yRURt6Eijh: { label: "KuCoin DAG 3",     type: "exchange" },
  DAG2Evedeb9cS7d28bxF4wwgeryiEqfDo8diZMZg: { label: "KuCoin DAG 4",     type: "exchange" },
  DAG6LvxLSdWoC9uJZPgXtcmkcWBaGYypF6smaPyH: { label: "BitForex DAG",     type: "exchange" },
  DAG1pLpkyX7aTtFZtbF98kgA9QTZRzrsGaFmf4BT: { label: "Uphold DAG Exchange", type: "exchange" },
  DAG3sFdwPJAEJNkv5bJhFQgzCGRkv9mZXPjjK9FW: { label: "Bitrue DAG",       type: "exchange" },
  DAG7xJEbxJmZeJJC6jqfLHQd7JPRf5WmKrJqSvLo: { label: "Bitrue DAG 2",     type: "exchange" },
  DAG4PKqJ68MYKB9bPicGfzUbH3nqmz4q5H6YJZYM: { label: "Poloniex DAG",     type: "exchange" },
  DAG2NuRbQp3vX3X6p4bRKQ2TKe8vHXPqbq9xXGEd: { label: "LBank DAG",        type: "exchange" },
  // High-traffic custodial / exchange intermediary confirmed by intersection analysis
};

const EXPLORER_MAP: Record<string, (h: string) => string> = {
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  bitcoin: (h) => `https://blockchair.com/bitcoin/transaction/${h}`,
  polygon: (h) => `https://polygonscan.com/tx/${h}`,
  bsc: (h) => `https://bscscan.com/tx/${h}`,
  xrp: (h) => `https://xrpscan.com/tx/${h}`,
  xlm: (h) => `https://stellarchain.io/transactions/${h}`,
  hbar: (h) => `https://hashscan.io/mainnet/transaction/${h}`,
  xdc: (h) => `https://xdcscan.io/txs/${h}`,
  dag: (h) => `https://dagexplorer.io/transaction/${h}`,
};

const WALLET_EXPLORER_MAP: Record<string, (a: string) => string> = {
  ethereum: (a) => `https://etherscan.io/address/${a}`,
  bitcoin: (a) => `https://blockchair.com/bitcoin/address/${a}`,
  polygon: (a) => `https://polygonscan.com/address/${a}`,
  bsc: (a) => `https://bscscan.com/address/${a}`,
  xrp: (a) => `https://xrpscan.com/account/${a}`,
  xlm: (a) => `https://stellarchain.io/accounts/${a}`,
  hbar: (a) => `https://hashscan.io/mainnet/account/${a}`,
  xdc: (a) => `https://xdcscan.io/address/${a}`,
  dag: (a) => `https://dagexplorer.io/address/${a}`,
};

// ─── Trail types ──────────────────────────────────────────────────────────────
interface TrailEntry {
  address: string;
  depth: number;
  parentAddress: string | null;
  knownInfo?: { label: string; type: string };
  isExpanded: boolean;
  isLoading: boolean;
  error?: boolean;
  totalValueUsd: number;
  txCount: number;
  childAddresses: string[];
}

// ─── Origin Trace hop ─────────────────────────────────────────────────────────
interface OriginHop {
  hop: number;
  address: string;
  txHash: string | null;
  txAmount: string;
  txAsset: string;
  txTimestamp: string;
  txMemo?: string | null;
  txDestinationTag?: number | null;
  knownInfo?: { label: string; type: string };
  stopReason?: "exchange" | "dead-end" | "max-hops" | "loop" | null;
  isLoading: boolean;
  error?: string | null;
}

// ─── Transaction type (from API) ──────────────────────────────────────────────
interface Tx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  valueUsd: number;
  fee: string;
  feeUsd: number;
  timestamp: string;
  blockNumber: number;
  status: "success" | "failed" | "pending";
  direction: "in" | "out" | "self";
  tokenSymbol: string | null;
  tokenName: string | null;
  memo?: string | null;
  destinationTag?: number | null;
}

// ─── XLM asset allowlist + per-asset minimum amounts ─────────────────────────
// Only these 8 assets are shown for XLM wallets; all others are silently dropped.
const XLM_ALLOWED_ASSETS: Record<string, number> = {
  XLM:   1,
  USDC:  1,
  VELO:  1000,
  SHX:   1000,
  AQUA:  10000,
  AFR:   10000,
  LSP:   10000,
  SSLX:  10000,
};

/** Returns true when a transaction should be shown for an XLM wallet. */
function xlmPassesFilter(tx: { tokenSymbol?: string | null; value: string }): boolean {
  const asset = (tx.tokenSymbol ?? "XLM").toUpperCase();
  const minAmt = XLM_ALLOWED_ASSETS[asset];
  if (minAmt === undefined) return false;       // asset not in allowlist — drop
  return parseFloat(tx.value) >= minAmt;        // below threshold — drop
}

/** DAG-specific minimum: 1 DAG micro-payments are spam/reward dust — require ≥2 DAG. */
const MIN_AMOUNT_DAG = 2;

/**
 * Global spam / dust filter applied uniformly across ALL reports and ALL chains.
 * XLM: uses the per-asset allowlist (xlmPassesFilter).
 * BTC / ETH: minimum 0.001 native (small coins — even tiny BTC transfers are meaningful).
 * DAG: minimum 2.0 (1 DAG micro-payments from reward wallets are filtered out).
 * Everything else (XRP, HBAR, XDC, Polygon, BSC, …): minimum 1.0 native token.
 * 0-value transactions (spam airdrops, farming, fee-only ops) are always dropped.
 */
function passesSpamFilter(
  tx: { value: string; tokenSymbol?: string | null },
  reportChain: string
): boolean {
  if (reportChain === "xlm") return xlmPassesFilter(tx);
  const v = parseFloat(tx.value || "0");
  if (!isFinite(v) || v === 0) return false;
  const min = reportChain === "bitcoin" || reportChain === "ethereum" ? 0.001
            : reportChain === "dag" ? MIN_AMOUNT_DAG
            : 1.0;
  return v >= min;
}

// ─── Grouped by (address + direction) ─────────────────────────────────────────
interface GroupedRow {
  address: string;
  direction: "in" | "out";
  totalValue: number;
  txCount: number;
  latestTs: string;
  asset: string;
}

// ─── Multi-wallet analysis color palette ─────────────────────────────────────
const WALLET_COLORS = [
  { dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-500/30" },
  { dot: "bg-blue-400",    text: "text-blue-300",    bg: "bg-blue-950/40",    border: "border-blue-500/30"    },
  { dot: "bg-amber-400",   text: "text-amber-300",   bg: "bg-amber-950/40",   border: "border-amber-500/30"   },
  { dot: "bg-purple-400",  text: "text-purple-300",  bg: "bg-purple-950/40",  border: "border-purple-500/30"  },
  { dot: "bg-rose-400",    text: "text-rose-300",    bg: "bg-rose-950/40",    border: "border-rose-500/30"    },
] as const;

// ─── Multi-wallet commingling types ──────────────────────────────────────────
interface MultiGraphNode {
  address: string;
  depth: number;
  via: string | null;
  pathChain: string[];
  txCount: number;
  totalValueUsd: number;
}

interface MultiSharedEntry {
  address: string;
  knownInfo?: { label: string; type: "exchange" | "genesis" | "defi" | "flagged" | "bridge" | "dag-team" | "official" };
  appearances: Array<{
    wallet: string;
    depth: number;
    txCount: number;
    totalValueUsd: number;
    via: string | null;
    pathChain: string[];
  }>;
}

interface MultiAnalysisResult {
  trackedWallets: string[];
  sharedCounterparties: MultiSharedEntry[];
  commonEndpoints: MultiSharedEntry[];
  patterns: Array<{
    id: number;
    sharedAddr: string;
    knownInfo?: { label: string; type: "exchange" | "genesis" | "defi" | "flagged" | "bridge" | "dag-team" | "official" };
    totalTxCount: number;
    totalValueUsd: number;
    paths: Array<{ wallet: string; path: string[] }>;
  }>;
}

// ─── Commingle Check types ────────────────────────────────────────────────────
interface CommingleFinding {
  sharedAddress: string;
  knownInfo?: { label: string; type: string };
  tier: number;
  targetPath: string[];
  comparisons: Array<{ wallet: string; path: string[] }>;
  txCountTarget: number;
}

interface CommingleCheckResult {
  targetWallet: string;
  comparisonWallets: string[];
  chain: string;
  scannedAt: string;
  findings: CommingleFinding[];
  tieredCounts: [number, number, number, number];
  totalScanned: number;
  // Best TX for each intermediate hop segment: key = "fromAddr::toAddr"
  segmentTxs: Record<string, Tx | null>;
  // Debug stats per intermediate hop wallet: how many pages/ops were fetched
  hopFetchStats: Record<string, { pages: number; txs: number; rateLimitEvents?: number; failReason?: string }>;
  // Filtered transactions for each cluster wallet (for display purposes)
  walletTxs: Record<string, Tx[]>;
  // First-class exchange flow data detected during the scan from raw transaction history.
  // Each entry = one (exchAddr × sourceWallet) pair with ALL matching transactions.
  // Populated from unfiltered tx fetches so no asset/amount filter can drop exchange flows.
  exchFlows: Array<{
    exchAddr: string;
    exchLabel: string;
    exchType: string;
    sourceWallet: string;
    txs: Tx[];
  }>;
}

const DAG_BATCH = 250;
const XRP_INIT = 200;
const XRP_BATCH = 500;
const OTHER_BATCH = 1000;
const MAX_TOTAL = 25000;

export default function WalletDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const address = (params.address || "").trim();
  type ChainId = "ethereum" | "bitcoin" | "xrp" | "xlm" | "hbar" | "xdc" | "dag";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;

  // ── Ledger view toggles ──
  const [groupByCounterparty, setGroupByCounterparty] = useState(true);
  type ViewMode = "in-first" | "out-first" | "mixed";
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("chaintrace-view-mode") as ViewMode) ?? "in-first"; }
    catch { return "in-first"; }
  });
  function setAndSaveViewMode(m: ViewMode) {
    setViewMode(m);
    try { localStorage.setItem("chaintrace-view-mode", m); } catch { /* noop */ }
  }

  // ── Group sort (only active when groupByCounterparty is ON) ──
  type GroupSort = "most-txs" | "highest-value" | "recent" | "exchange-first";
  const [groupSort, setGroupSort] = useState<GroupSort>("most-txs");

  // ── Direction filter (only active when groupByCounterparty is ON) ──
  type DirFilter = "all" | "only-in" | "only-out";
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");

  // ── Minimum amount filter — chain-specific default (BTC/ETH show small transfers) ──
  const defaultMinAmount = chain === "bitcoin" || chain === "ethereum" ? 0.001
                         : chain === "dag" ? MIN_AMOUNT_DAG
                         : 1;
  const [minAmount, setMinAmount] = useState(defaultMinAmount);
  const [minAmountInput, setMinAmountInput] = useState(String(defaultMinAmount));

  // ── All pagination state in one ref — plain mutable object, zero stale-closure risk ──
  // Reading page.current in render always gives the latest value.
  // setAllTxs(page.current.txs) is the only state update needed to trigger a re-render.
  const page = useRef({
    txs: [] as Tx[],
    cursor: null as string | null,
    hasMore: false,
    busy: false,
    error: null as string | null,
    status: null as string | null,
  });

  // allTxs is state ONLY so useMemo dependencies (filteredTxs, groupedRows) re-run on changes.
  // Everything else is read directly from page.current in the render.
  const [allTxs, setAllTxs] = useState<Tx[]>([]);
  const [showDonate, setShowDonate] = useState(false);
  const [copiedDonate, setCopiedDonate] = useState<string | null>(null);
  const copyDonateAddr = (addr: string) => {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopiedDonate(addr);
    setTimeout(() => setCopiedDonate(null), 2000);
  };

  // ── Multi-wallet selection ──────────────────────────────────────────────────
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set());
  const toggleSelected = (addr: string) =>
    setSelectedWallets((prev) => { const s = new Set(prev); if (s.has(addr)) s.delete(addr); else s.add(addr); return s; });
  const clearSelected = () => setSelectedWallets(new Set());

  // ── Investigative report modal ─────────────────────────────────────────────
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [reportLinkCopied, setReportLinkCopied] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [reportJsonData, setReportJsonData] = useState<unknown>(null);

  // ── Audit log + tamper-evident signature footer ────────────────────────────────
  // Appended to every report. SHA-256 is computed over all content up to (but
  // not including) the seal block itself, so any post-generation alteration
  // changes the hash and can be detected.
  function auditAndSign(
    lines: string[],
    meta: {
      reportType: string;
      chain: string;
      target: string;
      comparisons?: string[];
      depth?: string;
      minAmount?: string;
      nodesScanned?: number;
      walletLabels?: boolean;
    }
  ): string {
    const now  = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const dbl  = "═".repeat(64);
    const rule = "─".repeat(66);

    lines.push("");
    lines.push(dbl);
    lines.push("AUDIT LOG \u2014 CHAIN OF CUSTODY");
    lines.push(dbl);
    lines.push(`Report Type     : ${meta.reportType}`);
    lines.push(`Generated by    : CryptoChainTrace User`);
    lines.push(`Timestamp       : ${now}`);
    lines.push(`Chain           : ${meta.chain}`);
    if (meta.walletLabels) {
      lines.push(`Wallet 1        : ${meta.target}`);
      (meta.comparisons ?? []).forEach((w, i) =>
        lines.push(`Wallet ${i + 2}        : ${w}`)
      );
    } else {
      lines.push(`Target Wallet   : ${meta.target}`);
      (meta.comparisons ?? []).forEach((w, i) =>
        lines.push(`Comparison ${String(i + 1).padEnd(5)}: ${w}`)
      );
    }
    if (meta.depth        !== undefined) lines.push(`Depth           : ${meta.depth}`);
    if (meta.minAmount    !== undefined) lines.push(`Min Tx Amount   : ${meta.minAmount}`);
    if (meta.nodesScanned !== undefined) lines.push(`Nodes Scanned   : ${meta.nodesScanned}`);
    lines.push(`Report Version  : v1.2.4`);
    lines.push(`Platform        : cryptochaintrace.replit.app`);
    lines.push("");
    lines.push(dbl);
    lines.push("Generated by CryptoChainTrace  \u00b7  cryptochaintrace.replit.app");

    const preHash = lines.join("\n");
    const hash    = sha256Sync(preHash);

    lines.push("");
    lines.push(rule);
    lines.push("DIGITAL SIGNATURE / TAMPER-EVIDENT SEAL");
    lines.push(`Report Hash  : ${hash}`);
    lines.push(`Generated    : ${now}`);
    lines.push("This document is cryptographically signed and tamper-evident.");
    lines.push("Any alteration will invalidate this hash.");
    lines.push(rule);
    return lines.join("\n");
  }

  function generateReport(): string {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const chainUp = chain.toUpperCase();
    const short = (a: string) => a.length > 18 ? `${a.slice(0, 10)}...${a.slice(-6)}` : a;
    const shortHash = (h: string) => h ? (h.length > 12 ? `${h.slice(0, 10)}...` : h) : "(none)";
    const fmtAmt = (v: string, dir: "in" | "out") => {
      const n = parseFloat(v);
      const sign = dir === "in" ? "+" : "−";
      if (!n || isNaN(n)) return `${sign}0.00`;
      // Use enough decimals so tiny BTC/XRP/DAG amounts never round to 0.0000
      const abs = Math.abs(n);
      const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
      return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    };
    const fmtDate = (ts: string) => ts ? ts.replace("T", " ").slice(0, 16) + " UTC" : "—";
    const fmtVal  = (v: number)  => v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 6 });
    const sep = (label = "") => label
      ? `\n─── ${label} ${"─".repeat(Math.max(0, 60 - label.length - 5))}`
      : "─".repeat(64);
    const lines: string[] = [];
    // ── Private-only filtering — same rule as Commingle Check ──────────────────
    // exchange/bridge/genesis = infrastructure flows → Exchange section only.
    // DAG5KmHp9gFS... = genesis/reward wallet, hard-excluded from all private sections.
    const REPORT_EXCL = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);
    const isExchAddr  = (a: string) => ["exchange", "bridge", "genesis"].includes(KNOWN_LABELS[a]?.type ?? "");
    const isPrivAddr  = (a: string) => !isExchAddr(a) && !REPORT_EXCL.has(a);

    lines.push(`╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║        INVESTIGATIVE REPORT — CryptoChainTrace              ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push(`Generated : ${now}`);
    lines.push(`Chain     : ${chainUp}   |   Selected Wallets : ${selectedWallets.size}`);
    lines.push("");

    // Subject wallet
    lines.push(sep("SUBJECT WALLET"));
    lines.push("");
    const rootLabel = KNOWN_LABELS[address];
    lines.push(`  [ROOT]  ${address}`);
    if (rootLabel) lines.push(`          Label   : ${rootLabel.label} (${rootLabel.type})`);
    lines.push(`          Balance : ${wallet?.balance ?? "?"} ${chainUp}`);
    lines.push(`          Txs     : ${wallet?.transactionCount ?? allTxs.length}`);
    lines.push(`          Last    : ${wallet?.lastSeen ? wallet.lastSeen.slice(0, 10) : "unknown"}`);
    lines.push("");

    // Build per-address map from groupedRows (filtered by selection)
    const byAddr = new Map<string, GroupedRow[]>();
    for (const r of groupedRows) {
      if (!selectedWallets.has(r.address)) continue;
      if (!byAddr.has(r.address)) byAddr.set(r.address, []);
      byAddr.get(r.address)!.push(r);
    }
    // Ensure every selected wallet appears even if filtered out by minAmount
    for (const a of selectedWallets) if (!byAddr.has(a)) byAddr.set(a, []);

    // Private-only tree: exchanges, bridges, genesis, and hard-excluded wallets are
    // stripped here and appear exclusively in the Exchange section below.
    const addrs     = Array.from(byAddr.keys());
    const privAddrs = addrs.filter(isPrivAddr);
    lines.push(sep(`TRANSACTION TREE — PRIVATE WALLETS  (${address.slice(0, 10)}...)  →  ${privAddrs.length} private`));
    lines.push("");
    if (privAddrs.length === 0) {
      lines.push("  No private wallet counterparties selected.");
      lines.push("  All selected counterparties are exchange / bridge / official wallets.");
      lines.push("  See the Exchange / Custodial / Bridge / Official Flows section below.");
      lines.push("");
    } else {
      lines.push(`  ${address}${KNOWN_LABELS[address] ? `  ← ${KNOWN_LABELS[address].label.toUpperCase()}` : ""}`);
      lines.push(`  │`);
      privAddrs.forEach((addr, i) => {
        const rows = byAddr.get(addr)!;
        const known = KNOWN_LABELS[addr];
        const isLast = i === privAddrs.length - 1;
        const connector = isLast ? "└──" : "├──";
        const indent    = isLast ? "   " : "│  ";
        const inRow  = rows.find(r => r.direction === "in");
        const outRow = rows.find(r => r.direction === "out");
        const dirLabel = inRow && outRow ? "IN+OUT" : outRow ? "OUT" : "IN";
        const totalTxs = rows.reduce((s, r) => s + r.txCount, 0);
        const totalVal = rows.reduce((s, r) => s + r.totalValue, 0);
        const lastTs = rows.reduce((l, r) => r.latestTs > l ? r.latestTs : l, "").slice(0, 10);
        const labelStr = known ? `  ← ${known.label.toUpperCase()}` : "";

        lines.push(`  ${connector} ${dirLabel}  →  ${short(addr)}${labelStr}`);
        lines.push(`  ${indent}   Full  : ${addr}`);
        lines.push(`  ${indent}   Total : ${totalTxs.toLocaleString("en-US")} tx${totalTxs !== 1 ? "s" : ""}  |  ${fmtVal(totalVal)} ${chainUp}  |  Last: ${lastTs || "—"}`);

        // Individual transactions for this counterparty
        const txsForAddr = allTxs
          .filter(t => {
            const cp = t.direction === "in" ? t.from : t.to;
            if (cp !== addr) return false;
            return passesSpamFilter(t, chain);
          })
          .slice(0, 12);

        if (txsForAddr.length > 0) {
          lines.push(`  ${indent}   │`);
          txsForAddr.forEach((tx, ti) => {
            const txConn     = ti === txsForAddr.length - 1 ? "└──" : "├──";
            const txChildPfx = ti === txsForAddr.length - 1 ? "   " : "│  ";
            const dir   = tx.direction === "in" ? "IN " : "OUT";
            const amt   = fmtAmt(tx.value, tx.direction as "in" | "out");
            const asset = tx.tokenSymbol || chainUp;
            lines.push(`  ${indent}   ${txConn} ${dir}  (TA: ${tx.hash || "(none)"})  ${amt} ${asset}  ${fmtDate(tx.timestamp || "")}`);
            if (tx.destinationTag != null) lines.push(`  ${indent}   ${txChildPfx}     ↳ Destination Tag : ${tx.destinationTag}`);
            if (tx.memo)                   lines.push(`  ${indent}   ${txChildPfx}     ↳ Memo            : ${tx.memo}`);
          });
          const remaining = totalTxs - txsForAddr.length;
          if (remaining > 0) lines.push(`  ${indent}       (+ ${remaining} more transactions not shown)`);
        }

        if (!isLast) lines.push(`  │`);
      });
      lines.push("");
    }

    // Flow summary — private wallets only; exchanges appear in the Exchange section below.
    const outRows = groupedRows.filter(r => selectedWallets.has(r.address) && r.direction === "out" && isPrivAddr(r.address));
    const inRows  = groupedRows.filter(r => selectedWallets.has(r.address) && r.direction === "in"  && isPrivAddr(r.address));
    if (outRows.length > 0 || inRows.length > 0) {
      lines.push(sep("TRANSACTION FLOW SUMMARY"));
      lines.push("");
      if (outRows.length > 0) {
        lines.push(`  OUTBOUND  (${address.slice(0, 8)}...  →  selected wallets)`);
        for (const r of outRows.slice(0, 10)) {
          const kn = KNOWN_LABELS[r.address];
          lines.push(`    → ${short(r.address)}${kn ? `  [${kn.label}]` : ""}  |  ${r.txCount.toLocaleString("en-US")} tx  |  ${fmtVal(r.totalValue)} ${chainUp}`);
        }
        lines.push("");
      }
      if (inRows.length > 0) {
        lines.push(`  INBOUND   (selected wallets  →  ${address.slice(0, 8)}...)`);
        for (const r of inRows.slice(0, 10)) {
          const kn = KNOWN_LABELS[r.address];
          lines.push(`    ← ${short(r.address)}${kn ? `  [${kn.label}]` : ""}  |  ${r.txCount.toLocaleString("en-US")} tx  |  ${fmtVal(r.totalValue)} ${chainUp}`);
        }
        lines.push("");
      }
    }

    lines.push(sep("NOTE — EXCHANGE / BRIDGE / OFFICIAL FLOWS"));
    lines.push("");
    lines.push("  Exchange, bridge, and official flows are excluded from this report.");
    lines.push("  Use the EXCHANGE FLOWS REPORT (button on the wallet page) to view");
    lines.push("  all transactions touching known exchange and custodial addresses.");
    lines.push("");

    return auditAndSign(lines, {
      reportType: "Wallet Profile Report",
      chain: chain.toUpperCase(),
      target: address,
    });
  }

  function generateTrailReport(): string {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const chainUp = chain.toUpperCase();
    const sep = (label = "") => label
      ? `\n─── ${label} ${"─".repeat(Math.max(0, 60 - label.length - 5))}`
      : "─".repeat(64);
    const lines: string[] = [];

    lines.push(`╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║          TRAIL TRACE REPORT — CryptoChainTrace              ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push(`Generated : ${now}`);
    lines.push(`Chain     : ${chainUp}   |   Nodes: ${trailEntries.length}   |   Commingling: ${comminglingAddresses.size}`);
    lines.push("");

    if (trailEntries.length === 0) {
      lines.push("  No trail data. Run START TRAIL TRACE first.");
      return lines.join("\n");
    }

    const root = trailEntries[0];
    lines.push(sep("ROOT WALLET"));
    lines.push("");
    const rootKnown = KNOWN_LABELS[root.address];
    lines.push(`  [ROOT]  ${root.address}`);
    if (rootKnown) lines.push(`          Label   : ${rootKnown.label.toUpperCase()}`);
    lines.push(`          Tx Count : ${root.txCount}   |   USD: $${root.totalValueUsd.toLocaleString()}`);
    lines.push("");

    lines.push(sep("TRAIL TREE"));
    lines.push("");

    const fmtTrailAmt = (v: string, dir: string) => {
      const n   = parseFloat(v);
      const abs = Math.abs(n);
      const dec = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
      const sign = dir === "in" ? "+" : "−";
      return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
    };
    const printNode = (entry: TrailEntry, prefix: string, isLast: boolean) => {
      const conn     = isLast ? "└── " : "├── ";
      const childPfx = isLast ? "     " : "│    ";
      const known    = KNOWN_LABELS[entry.address];
      const isComm   = comminglingAddresses.has(entry.address);
      const flags    = [
        known       ? `← ${known.label.toUpperCase()}` : "",
        isComm      ? "⚠ COMMINGLING HUB" : "",
        entry.error ? "! ERROR" : "",
      ].filter(Boolean).join("  ");
      // Full address on connector line — no truncation
      lines.push(`  ${prefix}${conn}${entry.address}${flags ? "  " + flags : ""}`);
      lines.push(`  ${prefix}${childPfx}Depth: ${entry.depth}   Txs: ${entry.txCount}   USD: $${entry.totalValueUsd.toLocaleString()}`);
      // Best IN + OUT transactions for this hop from loaded history
      const hopPool = allTxs.filter(t =>
        (t.direction === "in" ? t.from : t.to) === entry.address &&
        passesSpamFilter(t, chain)
      );
      const bestIn  = hopPool.filter(t => t.direction === "in" ).sort((a, b) => parseFloat(b.value) - parseFloat(a.value))[0];
      const bestOut = hopPool.filter(t => t.direction === "out").sort((a, b) => parseFloat(b.value) - parseFloat(a.value))[0];
      const hopTxs  = [bestIn, bestOut].filter(Boolean) as Tx[];
      if (hopTxs.length > 0) {
        hopTxs.forEach((tx) => {
          const dir   = tx.direction === "in" ? "IN " : "OUT";
          const asset = (tx as Tx & { tokenSymbol?: string }).tokenSymbol || chainUp;
          const amt   = `${fmtTrailAmt(tx.value, tx.direction)} ${asset}`;
          const usd   = tx.valueUsd > 0
            ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]`
            : "";
          const date  = tx.timestamp ? tx.timestamp.replace("T", " ").slice(0, 16) + " UTC" : "—";
          lines.push(`  ${prefix}${childPfx}[${dir}]  ${amt}${usd}`);
          lines.push(`  ${prefix}${childPfx}       TX   : ${tx.hash ?? "(none)"}`);
          lines.push(`  ${prefix}${childPfx}       Date : ${date}`);
          if (tx.destinationTag != null) lines.push(`  ${prefix}${childPfx}       Tag  : ${tx.destinationTag}`);
          if (tx.memo)                   lines.push(`  ${prefix}${childPfx}       Memo : ${tx.memo}`);
        });
      } else {
        lines.push(`  ${prefix}${childPfx}(no TX history loaded for this hop)`);
      }
      const children = trailEntries.filter(e => e.parentAddress === entry.address);
      children.forEach((child, ci) => printNode(child, prefix + childPfx, ci === children.length - 1));
    };

    const rootChildren = trailEntries.filter(e => e.parentAddress === root.address);
    rootChildren.forEach((child, i) => printNode(child, "", i === rootChildren.length - 1));
    lines.push("");

    // Commingling hubs: exclude exchange/bridge/genesis/hard-excluded addresses —
    // only private wallet addresses should be flagged as commingling hubs.
    const TRAIL_EXCLUDED = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);
    const privateHubs = Array.from(comminglingAddresses).filter((a) => {
      if (TRAIL_EXCLUDED.has(a)) return false;
      const t = KNOWN_LABELS[a]?.type;
      return t !== "exchange" && t !== "bridge" && t !== "genesis";
    });
    if (privateHubs.length > 0) {
      lines.push(sep("COMMINGLING HUBS DETECTED"));
      lines.push("");
      for (const addr of privateHubs) {
        const known = KNOWN_LABELS[addr];
        const entry = trailEntries.find(e => e.address === addr);
        const dagTag = known?.type === "dag-team" ? "  ◄ DAG OFFICIAL ENTITY" : "";
        lines.push(`  ⚠  ${addr}${known ? `  [${known.label.toUpperCase()}]${dagTag}` : ""}`);
        if (entry) lines.push(`       Txs: ${entry.txCount}   Depth: ${entry.depth}   USD: $${entry.totalValueUsd.toLocaleString()}`);
      }
      lines.push("");
    }

    lines.push(sep("NOTE — EXCHANGE / BRIDGE / OFFICIAL FLOWS"));
    lines.push("");
    lines.push("  Exchange, bridge, and official flows are excluded from this report.");
    lines.push("  Use the EXCHANGE FLOWS REPORT (button on the wallet page) to view");
    lines.push("  all transactions touching known exchange and custodial addresses.");
    lines.push("");

    return auditAndSign(lines, {
      reportType: "Trail Trace Report",
      chain: chainUp,
      target: address,
      depth: "5 hops",
    });
  }

  function generateCommingleReport(): string {
    if (!commingleResult) return "";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const chainUp = commingleResult.chain.toUpperCase();
    const sep = (label = "") => label
      ? `\n─── ${label} ${"─".repeat(Math.max(0, 60 - label.length - 5))}`
      : "─".repeat(64);
    const fmtDate = (ts: string) => ts ? ts.replace("T", " ").slice(0, 16) + " UTC" : "—";
    const fmtAmt = (v: string, dir: "in" | "out") => {
      const n = parseFloat(v);
      const sign = dir === "in" ? "+" : "−";
      if (!n || isNaN(n)) return `${sign}0.00`;
      // Use enough decimals so tiny BTC/XRP/DAG amounts never round to 0.0000
      const abs = Math.abs(n);
      const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
      return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    };
    const lines: string[] = [];

    // Best single TX between any wallet and a given hop address —
    // checks segmentTxs, walletTxs for that wallet, then allTxs for the target.
    const bestTxForWallet = (wallet: string, hopAddr: string): Tx | null => {
      const segMap = commingleResult.segmentTxs ?? {};
      const seg    = segMap[`${wallet}::${hopAddr}`] ?? segMap[`${hopAddr}::${wallet}`] ?? null;
      if (seg) return seg;
      const wPool  = (commingleResult.walletTxs[wallet] ?? [])
        .filter(t => (t.direction === "in" ? t.from : t.to) === hopAddr)
        .sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
      if (wPool.length > 0) return wPool[0];
      if (wallet === commingleResult.targetWallet) {
        const pool = allTxs
          .filter(t => (t.direction === "in" ? t.from : t.to) === hopAddr && passesSpamFilter(t, commingleResult.chain))
          .sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
        if (pool.length > 0) return pool[0];
      }
      return null;
    };

    // Return up to `limit` txs sorted by amount descending (most significant first)
    const keyTxsFor = (addr: string, limit = 5) =>
      allTxs
        .filter((t) =>
          (t.direction === "in" ? t.from : t.to) === addr &&
          passesSpamFilter(t, commingleResult.chain) &&
          (commingleMinAmount <= 0 || parseFloat(t.value) >= commingleMinAmount)
        )
        .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))
        .slice(0, limit);
    // Return [highest-value IN tx, highest-value OUT tx] — exactly 2 TXs max
    // This gives the most significant transaction in each direction for investigative clarity.
    const bestInOut = (addr: string): Tx[] => {
      // Primary: allTxs — user-loaded history, direction from target's perspective.
      const pool = allTxs.filter((t) =>
        (t.direction === "in" ? t.from : t.to) === addr &&
        passesSpamFilter(t, commingleResult.chain) &&
        (commingleMinAmount <= 0 || parseFloat(t.value) >= commingleMinAmount)
      );
      const top = (dir: "in" | "out") =>
        pool.filter((t) => t.direction === dir)
            .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))[0];
      const fromAllTxs = [top("in"), top("out")].filter(Boolean) as Tx[];
      if (fromAllTxs.length > 0) return fromAllTxs;

      // Fallback 1: segmentTxs — hop-fetched full history, unfiltered by asset type.
      // The best (highest-value) TX between target and addr is stored under both key orders.
      const target = commingleResult.targetWallet;
      const segMap = commingleResult.segmentTxs ?? {};
      const segTx = segMap[`${target}::${addr}`] ?? segMap[`${addr}::${target}`] ?? null;
      if (segTx) return [segTx];

      // Fallback 2: walletTxs[target] — exchange scan (up to 2,000 ops, target's POV).
      const wPool = (commingleResult.walletTxs[target] ?? []).filter((t) =>
        (t.direction === "in" ? t.from : t.to) === addr
      );
      const wTop = (dir: "in" | "out") =>
        wPool.filter((t) => t.direction === dir)
             .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))[0];
      return [wTop("in"), wTop("out")].filter(Boolean) as Tx[];
    };

    // Format a path array, annotating each hop with its known label
    const fmtPath = (path: string[]) =>
      path.map(addr => {
        const kn = KNOWN_LABELS[addr];
        return kn ? `${addr}  [${kn.label}]` : addr;
      }).join(" → ");

    // Emit a detailed TX block — each TX shows explicit From → To addresses,
    // then Amount / full TX hash / Date on separate indented lines.
    const emitTxs = (txs: Tx[], pad: string) => {
      // Apply global spam filter — drop dust, 0-value ops, and below-chain-minimum TXs.
      const clean = txs.filter(t => passesSpamFilter(t, commingleResult.chain));
      if (clean.length === 0) return;
      lines.push(`${pad}│`);
      clean.forEach((tx, ti) => {
        const isLast   = ti === clean.length - 1;
        const conn     = isLast ? "└─" : "├─";
        const childPfx = isLast ? "   " : "│  ";
        const dir      = tx.direction === "in" ? "IN " : "OUT";
        const amt      = fmtAmt(tx.value, tx.direction as "in" | "out");
        const asset    = (tx as Tx & { tokenSymbol?: string }).tokenSymbol || chainUp;
        const usd      = tx.valueUsd > 0
          ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]`
          : "";
        lines.push(`${pad}${conn} [${dir}]  From: ${tx.from || "—"} → To: ${tx.to || "—"}`);
        lines.push(`${pad}${childPfx}  Amount: ${amt} ${asset}${usd}`);
        lines.push(`${pad}${childPfx}  TX    : ${tx.hash || "(none)"}`);
        lines.push(`${pad}${childPfx}  Date  : ${fmtDate(tx.timestamp || "")}`);
        if (tx.destinationTag != null) lines.push(`${pad}${childPfx}  ↳ Destination Tag : ${tx.destinationTag}`);
        if (tx.memo)                   lines.push(`${pad}${childPfx}  ↳ Memo            : ${tx.memo}`);
      });
    };

    // Emit one intermediate hop row: both wallet addresses + best cached TX.
    // Tries key fa::ta first, then ta::fa (covers both fetch directions).
    // Uses "Transactions — Hop N" label so the PDF renderer applies hop-tx-label CSS.
    const emitHopSegment = (fa: string, ta: string, hopNum: number) => {
      const fKn = KNOWN_LABELS[fa]; const tKn = KNOWN_LABELS[ta];
      // Hop address lines — explicit From / To before the TX block
      lines.push(`       Hop ${hopNum}:  ${fa}${fKn ? `  [${fKn.label}]` : ""}`);
      lines.push(`                →  ${ta}${tKn ? `  [${tKn.label}]` : ""}`);
      // Look up best TX — try both key directions since fetching is one-sided
      const map = commingleResult.segmentTxs ?? {};
      const segTx = map[`${fa}::${ta}`] ?? map[`${ta}::${fa}`] ?? null;
      if (segTx) {
        lines.push(`       Transactions — Hop ${hopNum}:`);
        emitTxs([segTx], "       ");
      } else {
        lines.push(`       Transactions — Hop ${hopNum}: (TX not in fetched history — path may be indirect)`);
      }
    };

    lines.push(`╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║        COMMINGLING CHECK REPORT — CryptoChainTrace          ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push(`Generated    : ${now}`);
    lines.push(`Chain        : ${chainUp}`);
    lines.push(`Wallet 1     : ${commingleResult.targetWallet}`);
    commingleResult.comparisonWallets.forEach((w, i) => {
      lines.push(`Wallet ${i + 2}     : ${w}`);
    });
    lines.push(`Depth        : 4 tiers   |   Nodes Scanned: ${commingleResult.totalScanned}`);
    lines.push(`Min Tx Amount: ${commingleMinAmount <= 0 ? "None (all transactions included)" : `${commingleMinAmount} ${chainUp} (dust/spam/fees filtered out)`}`);
    lines.push("");
    const hopStats = commingleResult.hopFetchStats ?? {};
    const hopEntries = Object.entries(hopStats);
    if (hopEntries.length > 0) {
      lines.push(`── HOP WALLET FETCH DEPTH (max 25,000 ops each) ──────────────`);
      for (const [addr, s] of hopEntries) {
        const kn = KNOWN_LABELS[addr];
        const tag = kn ? `  [${kn.label}]` : "";
        lines.push(`  ${addr}${tag}`);
        if (s.pages === 0) {
          lines.push(`    FAILED: ${s.failReason ?? "unknown error — 0 pages fetched"}`);
        } else {
          const rlNote = s.rateLimitEvents ? `  [rate-limited × ${s.rateLimitEvents} → waited & retried]` : "";
          const stopNote = s.failReason ? `  (stopped: ${s.failReason})` : "";
          lines.push(`    Fetched: ${s.txs} ops across ${s.pages} page${s.pages !== 1 ? "s" : ""}${rlNote}${stopNote}`);
        }
      }
      lines.push(`──────────────────────────────────────────────────────────────`);
      lines.push("");
    }

    const { findings: rawFindings } = commingleResult;
    // Hard-excluded addresses — stripped from ALL sections of the report entirely.
    // These are genesis/official wallets that should never appear as commingling evidence.
    const EXCLUDED_ADDRS = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);
    const findings = rawFindings.filter((f) => !EXCLUDED_ADDRS.has(f.sharedAddress));
    // Separate private wallets from exchange/custodial nodes.
    // Exchange, bridge, AND genesis are excluded from private commingling —
    // only unknown private wallets (incl. dag-team) count as commingling evidence.
    const isExch = (f: CommingleFinding) =>
      f.knownInfo?.type === "exchange" ||
      f.knownInfo?.type === "bridge" ||
      f.knownInfo?.type === "genesis";
    const privFindings = findings.filter((f) => !isExch(f));
    const exchFindings = findings.filter((f) => isExch(f));
    const t1priv = findings.filter((f) => f.tier === 1 && !isExch(f));
    const t1exch = findings.filter((f) => f.tier === 1 && isExch(f));
    const t2priv = findings.filter((f) => f.tier === 2 && !isExch(f));
    const t2exch = findings.filter((f) => f.tier === 2 && isExch(f));
    const t3priv = findings.filter((f) => f.tier === 3 && !isExch(f));
    const t3exch = findings.filter((f) => f.tier === 3 && isExch(f));
    const t4priv = findings.filter((f) => f.tier === 4 && !isExch(f));
    const t4exch = findings.filter((f) => f.tier === 4 && isExch(f));

    lines.push(sep("SUMMARY"));
    lines.push("");
    const dagTeamFindings = privFindings.filter((f) => f.knownInfo?.type === "dag-team");
    lines.push(`  Total Shared Nodes : ${findings.length}`);
    lines.push(`    ► Private wallets      : ${privFindings.length}  ← wallet-to-wallet commingling (key evidence)`);
    if (dagTeamFindings.length > 0) {
      lines.push(`         incl. ${dagTeamFindings.length} known DAG official entity(s)  ← marked ◄ DAG OFFICIAL ENTITY`);
    }
    lines.push(`    ► Exchange/Bridge/Offcl: ${exchFindings.length}  ← on-ramp / off-ramp / infrastructure flows`);
    lines.push("");
    lines.push(`  Tier breakdown:`);
    lines.push(`    Tier 1 (direct)  : ${t1priv.length} private  +  ${t1exch.length} exchange/official`);
    lines.push(`    Tier 2 (depth 2) : ${t2priv.length} private  +  ${t2exch.length} exchange/official`);
    lines.push(`    Tier 3 (depth 3) : ${t3priv.length} private  +  ${t3exch.length} exchange/official`);
    lines.push(`    Tier 4 (depth 4) : ${t4priv.length} private  +  ${t4exch.length} exchange/official`);
    lines.push("");

    if (findings.length === 0) {
      lines.push("  No shared nodes found within 4 tiers. Wallets appear unconnected.");
      lines.push("");
    } else {
      // Renders every connected wallet's trail + single best TX for a shared node finding.
      const renderSharedNodeWallets = (f: CommingleFinding) => {
        const allWallets: Array<{ wLabel: string; wallet: string; path: string[] }> = [
          { wLabel: "WALLET 1", wallet: commingleResult.targetWallet, path: f.targetPath },
          ...f.comparisons.map((c, ci) => ({ wLabel: `WALLET ${ci + 2}`, wallet: c.wallet, path: c.path })),
        ];
        allWallets.forEach(({ wLabel, wallet, path }, wi) => {
          const isLastW = wi === allWallets.length - 1;
          const wConn   = isLastW ? "  └──" : "  ├──";
          const wPfx    = isLastW ? "       " : "  │    ";
          const knW     = KNOWN_LABELS[wallet];
          lines.push(`${wConn} ${wLabel}  ${wallet}${knW ? `  [${knW.label}]` : ""}`);
          if (path.length > 0) {
            lines.push(`${wPfx}Trail:`);
            path.forEach((addr, pidx) => {
              const kn  = KNOWN_LABELS[addr];
              const lbl = kn ? `  [${kn.label}]` : "";
              if (pidx === 0) {
                lines.push(`${wPfx}  ${addr}${lbl}  ← ${wLabel}`);
              } else {
                lines.push(`${wPfx}  ↓  Hop ${pidx}`);
                lines.push(`${wPfx}  ${addr}${lbl}${pidx === path.length - 1 ? "  ← SHARED NODE" : ""}`);
              }
            });
          }
          const hopAddr  = path.length > 1 ? path[1] : f.sharedAddress;
          const hopShort = hopAddr.length > 16 ? `${hopAddr.slice(0, 8)}…${hopAddr.slice(-4)}` : hopAddr;
          const bestTx   = bestTxForWallet(wallet, hopAddr);
          lines.push(`${wPfx}Best TX (${wLabel} ↔ ${hopShort}):`);
          if (bestTx) {
            emitTxs([bestTx], wPfx);
          } else {
            lines.push(`${wPfx}  (none in fetched history)`);
          }
          lines.push("");
        });
      };

      // Helper: render private sub-section within a tier.
      const renderPrivExch = (
        priv: CommingleFinding[], exch: CommingleFinding[],
        maxShow: number
      ) => {
        if (priv.length > 0) {
          lines.push(`  ★ PRIVATE WALLET CONNECTIONS (${priv.length}) — INVESTIGATE FIRST`);
          lines.push("");
          priv.slice(0, maxShow).forEach((f, i) => {
            const isDagTeamNode = f.knownInfo?.type === "dag-team";
            const dagTag = isDagTeamNode ? "  ◄ DAG OFFICIAL ENTITY" : "";
            lines.push(`  ${String(i + 1).padStart(2, "0")}. ${f.sharedAddress}${f.knownInfo ? `  [${f.knownInfo.label.toUpperCase()}]${dagTag}` : ""}`);
            lines.push(`       TX Count (W1) : ${f.txCountTarget}   |   Connected by: ${f.comparisons.length + 1} wallet(s)`);
            lines.push("");
            renderSharedNodeWallets(f);
            lines.push("");
          });
          if (priv.length > maxShow) lines.push(`  … and ${priv.length - maxShow} more private connections`);
          lines.push("");
        }
        if (priv.length === 0) {
          lines.push("  None found.");
          lines.push("");
        }
      };

      // ── Tier 1 ──────────────────────────────────────────────────────────────
      lines.push(sep("TIER 1 — DIRECT SHARED COUNTERPARTIES"));
      lines.push("");
      // T1: best IN+OUT to shared wallet; exchange TX detail in consolidated section
      renderPrivExch(t1priv, t1exch, 20);

      // ── Tier 2 ──────────────────────────────────────────────────────────────
      lines.push(sep("TIER 2 — SECOND-DEGREE SHARED NODES"));
      lines.push("");
      // T2: full trail trace + best IN+OUT to first hop; exchange TX detail in consolidated section
      renderPrivExch(t2priv, t2exch, 20);

      // ── Tier 3–4 ────────────────────────────────────────────────────────────
      const t34priv = [...t3priv.slice(0, 10), ...t4priv.slice(0, 10)];
      if (t34priv.length > 0) {
        lines.push(sep("TIER 3–4 — DEEP SHARED NODES"));
        lines.push("");
        if (t34priv.length > 0) {
          lines.push(`  ★ PRIVATE WALLET CONNECTIONS (${t3priv.length + t4priv.length}) — INVESTIGATE`);
          lines.push("");
          t34priv.forEach((f, i) => {
            const isDagTeamNode = f.knownInfo?.type === "dag-team";
            const dagTag = isDagTeamNode ? "  ◄ DAG OFFICIAL ENTITY" : "";
            lines.push(`  ${String(i + 1).padStart(2, "0")}. ${f.sharedAddress}  (Tier ${f.tier})${f.knownInfo ? `  [${f.knownInfo.label.toUpperCase()}]${dagTag}` : ""}`);
            lines.push(`       TX Count (W1) : ${f.txCountTarget}   |   Connected by: ${f.comparisons.length + 1} wallet(s)`);
            lines.push("");
            renderSharedNodeWallets(f);
            lines.push("");
          });
          if (t3priv.length + t4priv.length > 20) lines.push(`  … and ${t3priv.length + t4priv.length - 20} more`);
          lines.push("");
        }
      }

      lines.push(sep("NOTE — EXCHANGE / BRIDGE / OFFICIAL FLOWS"));
      lines.push("");
      lines.push("  Exchange, bridge, and official flows are excluded from this report.");
      lines.push("  Use the dedicated EXCHANGE FLOWS REPORT to view all transactions");
      lines.push("  touching known exchange, bridge, and official protocol addresses.");
      lines.push("");
    }

    lines.push(sep("ASSESSMENT"));
    lines.push("");
    if (findings.length === 0) {
      lines.push("  LOW RISK — No shared nodes found within 4 tiers of separation.");
      lines.push("  The wallets under analysis do not appear to share any common");
      lines.push("  counterparties, intermediaries, or endpoints.");
    } else if (t1priv.length > 0) {
      lines.push("  HIGH RISK — Direct private wallet connections detected (Tier 1).");
      lines.push("  The selected wallets transact with the same private addresses");
      lines.push("  directly. This is a strong commingling indicator.");
      if (t1exch.length > 0)
        lines.push(`  NOTE: ${t1exch.length} shared exchange(s) also present — normal on-ramp/off-ramp use.`);
    } else if (t1exch.length > 0 && privFindings.length === 0) {
      lines.push("  EXCHANGE EXPOSURE ONLY — No private wallet commingling detected.");
      lines.push("  Both wallets route funds through common exchange(s). This is");
      lines.push("  expected for exchange users and is not itself commingling evidence.");
      lines.push(`  Shared exchange(s): ${exchFindings.slice(0, 5).map((f) => f.knownInfo?.label ?? f.sharedAddress).join(", ")}`);
    } else if (t1exch.length > 0 && privFindings.length > 0) {
      lines.push("  MEDIUM RISK — Exchange flows at Tier 1, private connections at deeper tiers.");
      lines.push("  No direct private commingling. Shared exchange flows are normal.");
      lines.push("  Investigate the private connections found at deeper tiers.");
    } else if (t2priv.length > 0) {
      lines.push("  MEDIUM RISK — Shared private nodes at Tier 2 detected.");
      lines.push("  Wallets share common 2nd-degree private connections. May indicate");
      lines.push("  indirect fund commingling or use of shared intermediaries.");
    } else {
      lines.push("  LOW-MEDIUM RISK — Shared nodes at Tier 3–4 or exchange-only.");
      lines.push("  Connections are distal and may reflect shared service usage");
      lines.push("  rather than direct commingling.");
    }
    lines.push("");
    return auditAndSign(lines, {
      reportType: "Commingling Check Report",
      chain: chainUp,
      target: commingleResult.targetWallet,
      comparisons: commingleResult.comparisonWallets,
      depth: "4 tiers",
      minAmount: commingleMinAmount <= 0
        ? "None (all transactions included)"
        : `${commingleMinAmount} ${chainUp}`,
      nodesScanned: commingleResult.totalScanned,
      walletLabels: true,
    });
  }

  // ── Intersection / Funnel Analysis Report ─────────────────────────────────────
  function generateMultiReport(): string {
    if (!multiResult) return "";
    const now     = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const chainUp = chain.toUpperCase();
    const sep = (label = "") => label
      ? `\n─── ${label} ${"─".repeat(Math.max(0, 60 - label.length - 5))}`
      : "─".repeat(64);
    const fmtDate  = (ts: string) => ts ? ts.replace("T", " ").slice(0, 16) + " UTC" : "—";
    const fmtAmt2  = (v: string, dir: "in" | "out") => {
      const n    = parseFloat(v);
      const sign = dir === "in" ? "+" : "−";
      if (!n || isNaN(n)) return `${sign}0.00`;
      const abs  = Math.abs(n);
      const dec  = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
      return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
    };
    const lines: string[] = [];
    const MULTI_EXCL  = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);
    const isExchType  = (addr: string) => ["exchange", "bridge", "genesis"].includes(KNOWN_LABELS[addr]?.type ?? "");

    const emitTxBlock = (txs: Tx[], pad: string) => {
      // Apply global spam filter — drop dust, 0-value ops, and below-chain-minimum TXs.
      const clean = txs.filter(t => passesSpamFilter(t, chain));
      if (clean.length === 0) return;
      lines.push(`${pad}│`);
      clean.forEach((tx, ti) => {
        const isLast   = ti === clean.length - 1;
        const conn     = isLast ? "└─" : "├─";
        const childPfx = isLast ? "   " : "│  ";
        const dir      = tx.direction === "in" ? "IN " : "OUT";
        const amt      = fmtAmt2(tx.value, tx.direction as "in" | "out");
        const asset    = (tx as Tx & { tokenSymbol?: string }).tokenSymbol || chainUp;
        const usd      = tx.valueUsd > 0
          ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]`
          : "";
        lines.push(`${pad}${conn} [${dir}]  From: ${tx.from ?? "—"} → To: ${tx.to ?? "—"}`);
        lines.push(`${pad}${childPfx}  Amount: ${amt} ${asset}${usd}`);
        lines.push(`${pad}${childPfx}  TX    : ${tx.hash ?? "(none)"}`);
        lines.push(`${pad}${childPfx}  Date  : ${fmtDate(tx.timestamp ?? "")}`);
        if (tx.destinationTag != null) lines.push(`${pad}${childPfx}  ↳ Destination Tag : ${tx.destinationTag}`);
        if (tx.memo)                   lines.push(`${pad}${childPfx}  ↳ Memo            : ${tx.memo}`);
      });
    };

    const bestInOut2 = (addr: string): Tx[] => {
      const pool = allTxs.filter(t =>
        (t.direction === "in" ? t.from : t.to) === addr &&
        passesSpamFilter(t, chain)
      );
      const top  = (dir: "in" | "out") =>
        pool.filter(t => t.direction === dir).sort((a, b) => parseFloat(b.value) - parseFloat(a.value))[0];
      return [top("in"), top("out")].filter(Boolean) as Tx[];
    };

    // Deduplicated shared entries (sharedCounterparties + commonEndpoints)
    const seenM    = new Set<string>();
    const allUniq  = [...multiResult.sharedCounterparties, ...multiResult.commonEndpoints]
      .filter(s => { if (seenM.has(s.address)) return false; seenM.add(s.address); return !MULTI_EXCL.has(s.address); });
    const privPoints = allUniq.filter(s => !isExchType(s.address));
    const exchPoints = allUniq.filter(s => isExchType(s.address));

    lines.push(`╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║  INTERSECTION / FUNNEL ANALYSIS — CryptoChainTrace          ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push(`Generated    : ${now}`);
    lines.push(`Chain        : ${chainUp}`);
    multiResult.trackedWallets.forEach((w, i) => {
      const kn = KNOWN_LABELS[w];
      lines.push(`Wallet ${String(i + 1).padStart(2, " ")}    : ${w}${kn ? `  [${kn.label}]` : ""}`);
    });
    lines.push(`Total Wallets: ${multiResult.trackedWallets.length}`);
    lines.push(`Depth        : up to 4 hops from each wallet (connections graph)`);
    lines.push(sep());
    lines.push(`NOTE: TX details are from the currently-loaded wallet's transaction history.`);
    lines.push(`      All wallets are treated equally — no single wallet is the "primary".`);
    lines.push(`      Load full TX history on each wallet for complete transaction records.`);

    // ── § 1 — Private Convergence Points ──────────────────────────────────────
    lines.push(sep("PRIVATE CONVERGENCE POINTS"));
    lines.push(`  Private addresses reached within 4 hops of 2+ tracked wallets.`);
    lines.push(`  These are the core investigative findings — potential funneling / mixing hubs.`);
    lines.push(`  Exchanges, bridges, and official nodes are EXCLUDED from this report.`);
    lines.push("");
    if (privPoints.length === 0) {
      lines.push("  No private convergence detected at depth 1–4.");
      lines.push("  Tracked wallets do not share private intermediaries within scanned depth.");
      lines.push("  Try loading more TX history and re-running for deeper coverage.");
      lines.push("");
    } else {
      privPoints.slice(0, 30).forEach((entry, i) => {
        const kn       = KNOWN_LABELS[entry.address];
        const label    = kn ? `  [${kn.label.toUpperCase()}]` : "";
        const teamNote = kn?.type === "dag-team" ? "  ◄ OFFICIAL DAG ENTITY — labeled, not anonymous" : "";
        lines.push(`  ${String(i + 1).padStart(2, "0")}. ${entry.address}${label}${teamNote}`);
        lines.push(`       Shared by : ${entry.appearances.length}/${multiResult.trackedWallets.length} tracked wallets`);
        lines.push("");
        entry.appearances.forEach((app, appIdx) => {
          const idx      = multiResult.trackedWallets.indexOf(app.wallet);
          const wLabel   = idx === 0 ? "PRIMARY" : `WALLET ${idx + 1}`;
          const isLast   = appIdx === entry.appearances.length - 1;
          const conn     = isLast ? "└──" : "├──";
          const childPfx = isLast ? "    " : "│   ";
          // Full trail: pathChain[0] = tracked wallet … pathChain[last] = shared node
          const trail: string[] = app.pathChain.length > 1
            ? app.pathChain.map((a, si) => {
                const kl  = KNOWN_LABELS[a];
                const lbl = kl ? `  [${kl.label}]` : "";
                if (si === 0) return `${a}${lbl}  ← ${wLabel}`;
                if (si === app.pathChain.length - 1) return `${a}${lbl}  ← SHARED NODE`;
                return `${a}${lbl}`;
              })
            : [`${app.wallet}  ← ${wLabel}`, `${entry.address}  ← SHARED NODE`];
          lines.push(`       ${conn} ${wLabel}  |  ${app.txCount} tx${app.txCount !== 1 ? "s" : ""}  |  depth-${app.depth}${app.totalValueUsd > 0 ? `  |  $${app.totalValueUsd.toFixed(2)} USD` : ""}`);
          lines.push(`       ${childPfx}  Trail:`);
          trail.forEach((step, si) => {
            if (si === 0) {
              lines.push(`       ${childPfx}    ${step}`);
            } else {
              lines.push(`       ${childPfx}    ↓  Hop ${si}`);
              lines.push(`       ${childPfx}    ${step}`);
            }
          });
          // Best TX: use first hop in the path (closest connection point)
          const hopAddr  = app.pathChain.length > 1 ? app.pathChain[1] : entry.address;
          const hopShort = hopAddr.length > 16 ? `${hopAddr.slice(0, 8)}…${hopAddr.slice(-4)}` : hopAddr;
          const bestTxs  = bestInOut2(hopAddr);
          if (bestTxs.length > 0) {
            lines.push(`       ${childPfx}  Best TX  (${wLabel} ↔ ${hopShort}):`);
            emitTxBlock(bestTxs, `       ${childPfx}  `);
          } else {
            lines.push(`       ${childPfx}  Best TX  : no loaded history for this hop`);
          }
          lines.push("");
        });
        lines.push("");
      });
      if (privPoints.length > 30) lines.push(`  … and ${privPoints.length - 30} more private convergence points`);
      lines.push("");
    }

    // ── Investigative Summary ──────────────────────────────────────────────────
    lines.push(sep("INVESTIGATIVE SUMMARY"));
    lines.push(`  Tracked Wallets    : ${multiResult.trackedWallets.length}`);
    lines.push(`  Private Convergence: ${privPoints.length} node${privPoints.length !== 1 ? "s" : ""}`);
    lines.push(`  Exchange Nodes     : ${exchPoints.length} node${exchPoints.length !== 1 ? "s" : ""}`);
    lines.push(`  Total Shared       : ${allUniq.length}`);
    lines.push("");
    if (privPoints.length > 0) {
      lines.push(`  ⚠  CONVERGENCE DETECTED — ${privPoints.length} private address${privPoints.length !== 1 ? "es" : ""} appear`);
      lines.push(`     in the transaction graph of 2+ tracked wallets.`);
      lines.push(`     These represent potential money-funneling / commingling hubs.`);
      lines.push(`     Investigative action: subpoena / KYC for each convergence address listed above.`);
    } else {
      lines.push(`  No private convergence detected within depth-4.`);
      lines.push(`  Load more TX history and re-run for broader coverage.`);
    }
    if (exchPoints.length > 0) {
      lines.push("");
      lines.push(`  EXCHANGE EXPOSURE — ${exchPoints.length} shared exchange/custodian node${exchPoints.length !== 1 ? "s" : ""} detected.`);
      lines.push(`  File subpoena / KYC requests with listed exchanges for account-holder records.`);
    }
    lines.push("");
    return auditAndSign(lines, {
      reportType: "Intersection / Funnel Analysis",
      chain: chainUp,
      target: multiResult.trackedWallets[0] ?? address,
      comparisons: multiResult.trackedWallets.slice(1),
      depth: "4",
      nodesScanned: multiResult.sharedCounterparties.length + multiResult.commonEndpoints.length,
    });
  }

  // ── EXCHANGE FLOWS REPORT — all IN/OUT TXs touching known exchanges/bridges ──
  function generateExchangeFlowsReport(): string {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const chainUp = chain.toUpperCase();
    const rule = "─".repeat(64);
    const dbl  = "═".repeat(64);
    const sep  = (label = "") => label
      ? `\n─── ${label} ${"─".repeat(Math.max(0, 58 - label.length))}`
      : rule;
    const fmtDate = (ts: string) =>
      ts ? ts.replace("T", " ").slice(0, 16) + " UTC" : "—";
    const fmtAmt = (v: string | number, dir: string) => {
      const n = typeof v === "number" ? v : parseFloat(v as string);
      if (!isFinite(n)) return (dir === "in" ? "+" : "−") + "0.0000";
      const abs = Math.abs(n);
      const dec = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
      return (dir === "in" ? "+" : "−") + abs.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };

    const lines: string[] = [];
    lines.push(`╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║      EXCHANGE FLOWS REPORT — CryptoChainTrace               ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push(`Generated    : ${now}`);
    lines.push(`Chain        : ${chainUp}`);
    lines.push(`Target       : ${address}`);
    lines.push(`Loaded TXs   : ${allTxs.length.toLocaleString()}`);
    lines.push(rule);
    lines.push(`NOTE: Shows every transaction from/to a known exchange, bridge, or`);
    lines.push(`      official protocol address. Private wallets are excluded.`);
    lines.push(`      Load full transaction history before running for complete coverage.`);
    lines.push("");

    // Determine if an address is an exchange/bridge/genesis that should appear in this report
    const isExchType = (t?: string) =>
      t === "exchange" || t === "bridge" || t === "genesis";

    // Clean display-name map — root exchange name → bracket label.
    // Mirrors the same map in generateCommingleReport / toBracketLabel.
    // Add new entries here as additional exchange addresses are added to KNOWN_LABELS.
    const EXCH_DISPLAY: Record<string, string> = {
      Coinbase:     "Coinbase Deposits",
      Kraken:       "Kraken",
      Binance:      "Binance",
      "Binance.US": "Binance.US",
      MEXC:         "MEXC",
      Bybit:        "Bybit",
      Bitfinex:     "Bitfinex",
      Bitstamp:     "Bitstamp",
      OKX:          "OKX",
      Huobi:        "Huobi",
      Uphold:       "Uphold",
      ChangeNOW:    "ChangeNOW",
      // Bridge / infrastructure
      Stellar:      "Stellar Foundation",
      // Additional exchanges — extend this list as needed
    };
    const toDisplayLabel = (lbl: string): string => {
      const firstWord = lbl.split(/\s+/)[0];
      return EXCH_DISPLAY[firstWord] ?? firstWord;
    };

    // Group TXs by exchange counterparty — primary source: target wallet's loaded history
    const exchTxMap = new Map<string, typeof allTxs>();
    for (const tx of allTxs) {
      const counterparty = tx.direction === "in" ? tx.from : tx.to;
      if (!counterparty) continue;
      const kn = KNOWN_LABELS[counterparty];
      if (!kn || !isExchType(kn.type)) continue;
      if (!exchTxMap.has(counterparty)) exchTxMap.set(counterparty, []);
      exchTxMap.get(counterparty)!.push(tx);
    }

    // Supplement from segmentTxs — hop wallet transactions captured during the Commingle
    // Check scan (fetchHopPages). If a Commingle Check was run before this report, its
    // segmentTxs holds hop→exchange TXs (e.g. GAZSPN→Kraken, GD6OZZ→Coinbase) that are
    // not visible in allTxs (which reflects only the target wallet's own history).
    // segmentTxs keys are "walletA::walletB" with both directions stored as the same TX.
    const segData = commingleResult?.segmentTxs ?? {};
    for (const segKey of Object.keys(segData)) {
      const cut = segKey.indexOf("::");
      if (cut < 0) continue;
      const fa = segKey.slice(0, cut);
      const ta = segKey.slice(cut + 2);
      // Check both sides — either address could be the known exchange
      for (const [exchAddr] of [[fa, ta], [ta, fa]] as [string, string][]) {
        const kn = KNOWN_LABELS[exchAddr];
        if (!kn || !isExchType(kn.type)) continue;
        const tx = segData[segKey];
        if (!tx) continue;
        // Dedup by hash before inserting
        const existing = exchTxMap.get(exchAddr);
        if (existing) {
          if (!existing.find(t => t.hash === tx.hash)) existing.push(tx);
        } else {
          exchTxMap.set(exchAddr, [tx]);
        }
      }
    }

    if (exchTxMap.size === 0) {
      lines.push(`  No exchange, bridge, or protocol transactions found in the`);
      lines.push(`  ${allTxs.length.toLocaleString()} loaded transactions.`);
      lines.push(`  Load full transaction history and re-run for complete coverage.`);
    } else {
      // Uphold DAG always first; then sort by label
      const UPHOLD_DAG = "DAG1pLpkyX7aTtFZtbF98kgA9QTZRzrsGaFmf4BT";
      const entries = Array.from(exchTxMap.entries()).sort(([a], [b]) => {
        if (a === UPHOLD_DAG) return -1;
        if (b === UPHOLD_DAG) return 1;
        return (KNOWN_LABELS[a]?.label ?? a).localeCompare(KNOWN_LABELS[b]?.label ?? b);
      });

      const totalTxs = entries.reduce((s, [, v]) => s + v.length, 0);
      lines.push(`  Found: ${entries.length} exchange/protocol address${entries.length !== 1 ? "es" : ""} with activity`);
      lines.push(`  Total exchange TXs: ${totalTxs.toLocaleString()}`);

      for (const [addr, txs] of entries) {
        const kn = KNOWN_LABELS[addr];
        const typeTag = kn?.type === "bridge" ? "BRIDGE" : kn?.type === "genesis" ? "PROTOCOL" : "EXCHANGE";
        const displayLbl = toDisplayLabel(kn?.label ?? addr);
        const headerLabel = `[${displayLbl}]  ◄ ${typeTag} FLOW`;
        lines.push(sep(headerLabel));
        lines.push(`  Address : ${addr}`);
        lines.push(`  Type    : ${typeTag} · ${displayLbl}`);

        const inTxs  = txs.filter(t => t.direction === "in");
        const outTxs = txs.filter(t => t.direction === "out");
        const totalIn  = inTxs.reduce((s, t) => s + (parseFloat(t.value) || 0), 0);
        const totalOut = outTxs.reduce((s, t) => s + (parseFloat(t.value) || 0), 0);
        lines.push(`  IN  TXs : ${inTxs.length}   Total Received : +${totalIn.toFixed(4)} ${chainUp}`);
        lines.push(`  OUT TXs : ${outTxs.length}   Total Sent     : −${totalOut.toFixed(4)} ${chainUp}`);
        lines.push("");

        const sortByDate = (a: Tx, b: Tx) =>
          new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime();
        // Apply global spam filter — only real-value txs in reports
        const cleanTxs = txs.filter(t => passesSpamFilter(t, chain)).sort(sortByDate);
        const renderExchBranch = (block: (typeof txs), addTrailingBlank: boolean) => {
          block.forEach((tx, i) => {
            const isLast = i === block.length - 1;
            const conn    = isLast ? "└─" : "├─";
            const childPx = isLast ? "   " : "│  ";
            const dir = tx.direction === "in" ? "IN " : "OUT";
            const asset = (tx as typeof tx & { tokenSymbol?: string }).tokenSymbol ?? chainUp;
            const usd = tx.valueUsd && tx.valueUsd > 0
              ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]`
              : "";
            lines.push(`${conn} [${dir}]  From: ${tx.from ?? "—"}`);
            lines.push(`${childPx}         To  : ${tx.to   ?? "—"}`);
            lines.push(`${childPx}  Amount : ${fmtAmt(tx.value, tx.direction)} ${asset}${usd}`);
            lines.push(`${childPx}  TX     : ${tx.hash ?? "(no hash)"}`);
            lines.push(`${childPx}  Date   : ${fmtDate(tx.timestamp ?? "")}`);
            if ((tx as typeof tx & { destinationTag?: number | null }).destinationTag != null)
              lines.push(`${childPx}  ↳ Destination Tag : ${(tx as typeof tx & { destinationTag?: number | null }).destinationTag}`);
            if (tx.memo) lines.push(`${childPx}  ↳ Memo : ${tx.memo}`);
            if (!isLast) lines.push(childPx);
          });
          if (addTrailingBlank) lines.push("");
        };
        if (cleanTxs.length > 0) renderExchBranch(cleanTxs, true);
        lines.push("");
      }
    }

    lines.push(sep("INVESTIGATIVE SUMMARY"));
    if (exchTxMap.size > 0) {
      lines.push(`  Exchange activity detected on this wallet.`);
      lines.push(`  File subpoena / KYC requests with each listed exchange to obtain`);
      lines.push(`  account-holder identity, IP logs, and transaction records.`);
      lines.push(`  Exchange addresses, TX hashes, and dates are documented above.`);
    } else {
      lines.push(`  No exchange transactions found in ${allTxs.length.toLocaleString()} loaded TXs.`);
      lines.push(`  Load full transaction history for complete coverage.`);
    }
    lines.push("");
    return auditAndSign(lines, {
      reportType: "Exchange Flows Report",
      chain: chainUp,
      target: address,
    });
  }

  // ── Victim → Thief Path Trace report generator ────────────────────────────
  function generatePathTraceReport(
    steps: Array<{ wallet: string; txHash: string }>,
    hopData: Array<{ from: string; to: string; knownHash: string; tx: Tx | null; allTxs: Tx[] }>,
    expandTxs: Tx[]
  ): string {
    const chainUp = chain.toUpperCase();
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const rule = "─".repeat(66);
    const sepSection = (label = "") =>
      label ? `\n${rule}\n  ${label}\n${rule}` : rule;

    const fmtDate = (ts: string) => ts ? ts.replace("T", " ").slice(0, 16) + " UTC" : "—";
    const fmtAmt  = (v: string, dir: "in" | "out") => {
      const n = parseFloat(v);
      const sign = dir === "in" ? "+" : "−";
      if (!n || isNaN(n)) return `${sign}0.00`;
      const abs = Math.abs(n);
      const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
      return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    };
    const emitTx = (tx: Tx, pad = "") => {
      const dir    = tx.direction === "in" ? "IN " : "OUT";
      const asset  = (tx as Tx & { tokenSymbol?: string }).tokenSymbol ?? chainUp;
      const usd    = tx.valueUsd && tx.valueUsd > 0
        ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD]`
        : "";
      const lines: string[] = [];
      lines.push(`${pad}  Direction : [${dir}]`);
      lines.push(`${pad}  Amount    : ${fmtAmt(tx.value, tx.direction as "in" | "out")} ${asset}${usd}`);
      lines.push(`${pad}  From      : ${tx.from ?? "—"}`);
      lines.push(`${pad}  To        : ${tx.to ?? "—"}`);
      lines.push(`${pad}  TX Hash   : ${tx.hash ?? "(no hash)"}`);
      lines.push(`${pad}  Date      : ${fmtDate(tx.timestamp ?? "")}`);
      if ((tx as Tx & { destinationTag?: number | null }).destinationTag != null)
        lines.push(`${pad}  ↳ Destination Tag : ${(tx as Tx & { destinationTag?: number | null }).destinationTag}`);
      if (tx.memo) lines.push(`${pad}  ↳ Memo    : ${tx.memo}`);
      return lines;
    };

    const walletAddrs = steps.map(s => s.wallet);
    const lines: string[] = [];
    lines.push(`╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║    VICTIM → THIEF PATH TRACE — CryptoChainTrace             ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push(`Generated    : ${now}`);
    lines.push(`Chain        : ${chainUp}`);
    steps.forEach((s, i) => {
      const role = i === 0 ? "VICTIM" : i === 1 ? "THIEF" : `HOP ${i + 1}`;
      const kn = KNOWN_LABELS[s.wallet];
      lines.push(`${role.padEnd(12)} : ${s.wallet}${kn ? `  [${kn.label}]` : ""}`);
      if (s.txHash) lines.push(`${"".padEnd(14)}  TX → ${s.txHash}`);
    });
    lines.push(`Total Hops   : ${hopData.length}`);
    lines.push("");

    // ── Per-hop details ────────────────────────────────────────────────────
    let originAmount: number | null = null;

    hopData.forEach((hop, idx) => {
      const fromKn   = KNOWN_LABELS[hop.from];
      const toKn     = KNOWN_LABELS[hop.to];
      const fromRole = idx === 0 ? "VICTIM" : `HOP ${idx + 1}`;
      const toRole   = idx === hopData.length - 1 ? "FINAL DESTINATION" : `HOP ${idx + 2}`;

      lines.push(sepSection(`HOP ${idx + 1}  —  ${fromRole} → ${toRole}`));
      lines.push(`  FROM      : ${hop.from}${fromKn ? `  [${fromKn.label.toUpperCase()}]` : "  (unidentified)"}`);
      lines.push(`  TO        : ${hop.to}${toKn   ? `  [${toKn.label.toUpperCase()}]`   : "  (unidentified)"}`);
      if (hop.knownHash) lines.push(`  Known TX  : ${hop.knownHash}`);
      lines.push("");

      // Primary TX — the user-specified hash, or best match from fetched history
      const primaryTx = hop.tx;
      if (primaryTx) {
        const amt = parseFloat(primaryTx.value) || 0;
        if (idx === 0 && originAmount === null && amt > 0) originAmount = amt;
        const taintPct = originAmount && originAmount > 0 && amt > 0
          ? ((amt / originAmount) * 100).toFixed(1)
          : null;
        if (taintPct !== null) lines.push(`  Taint     : ${taintPct}% of original stolen funds reached this point`);
        lines.push(`  ─ Transaction Detail ─`);
        emitTx(primaryTx, "  ").forEach(l => lines.push(l));
      } else if (hop.knownHash) {
        lines.push(`  ⚠  TX ${hop.knownHash.slice(0, 16)}…`);
        lines.push(`     not found in loaded history. Load full TX history on this wallet for full detail.`);
      } else {
        lines.push(`  ⚠  No TX hash provided and no matching transaction found between these wallets.`);
        lines.push(`     Load full TX history on the Hop ${idx + 1} wallet to locate the transaction.`);
      }

      // Additional transactions between this pair (supporting evidence) — spam filtered
      const extras = hop.allTxs.filter(t => t.hash !== primaryTx?.hash && passesSpamFilter(t, chain)).slice(0, 5);
      if (extras.length > 0) {
        lines.push("");
        lines.push(`  Additional transactions between these wallets (${extras.length} shown):`);
        extras.forEach((tx, ti) => {
          const isLast  = ti === extras.length - 1;
          const conn    = isLast ? "└─" : "├─";
          const childPx = isLast ? "   " : "│  ";
          const dir  = tx.direction === "in" ? "IN " : "OUT";
          const asset = (tx as Tx & { tokenSymbol?: string }).tokenSymbol ?? chainUp;
          const usd = tx.valueUsd && tx.valueUsd > 0
            ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD]`
            : "";
          lines.push(`  ${conn} [${dir}]  ${fmtAmt(tx.value, tx.direction as "in" | "out")} ${asset}${usd}  ${fmtDate(tx.timestamp ?? "")}`);
          lines.push(`  ${childPx}  Hash: ${tx.hash ?? "(none)"}`);
          if (tx.memo) lines.push(`  ${childPx}  Memo: ${tx.memo}`);
        });
      }
      lines.push("");
    });

    // ── Wallet clustering ─────────────────────────────────────────────────
    lines.push(sepSection("WALLET CLUSTERING"));
    const seenPositions = new Map<string, number[]>();
    walletAddrs.forEach((w, i) => {
      if (!seenPositions.has(w)) seenPositions.set(w, []);
      seenPositions.get(w)!.push(i + 1);
    });
    const clusters = [...seenPositions.entries()].filter(([, pos]) => pos.length > 1);
    if (clusters.length === 0) {
      lines.push("  No repeated wallets — each hop uses a distinct address.");
    } else {
      lines.push(`  ${clusters.length} wallet(s) appear at multiple path positions (potential mixing / address reuse):`);
      clusters.forEach(([addr, pos]) => {
        const kn = KNOWN_LABELS[addr];
        lines.push(`  • ${addr}${kn ? `  [${kn.label}]` : ""}`);
        lines.push(`    Positions : ${pos.join(", ")}`);
      });
    }
    lines.push("");

    // ── Expand from final wallet ──────────────────────────────────────────
    const lastAddr = walletAddrs[walletAddrs.length - 1];
    lines.push(sepSection(`EXPAND FROM FINAL WALLET — ${lastAddr}`));
    if (expandTxs.length === 0) {
      lines.push("  No further activity found from the final wallet in loaded history.");
      lines.push("  Load full TX history on the final wallet to expand the trail.");
    } else {
      lines.push(`  ${expandTxs.length} further transaction${expandTxs.length !== 1 ? "s" : ""} from the final wallet (newest first):`);
      lines.push("");
      expandTxs.forEach((tx, ti) => {
        const isLast  = ti === expandTxs.length - 1;
        const conn    = isLast ? "└─" : "├─";
        const childPx = isLast ? "   " : "│  ";
        const dir     = tx.direction === "in" ? "IN " : "OUT";
        const cp      = tx.direction === "in" ? tx.from : tx.to;
        const cpKn    = cp ? KNOWN_LABELS[cp] : null;
        const asset   = (tx as Tx & { tokenSymbol?: string }).tokenSymbol ?? chainUp;
        const usd     = tx.valueUsd && tx.valueUsd > 0
          ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD]`
          : "";
        lines.push(`${conn} [${dir}]  ${fmtAmt(tx.value, tx.direction as "in" | "out")} ${asset}${usd}`);
        lines.push(`${childPx}  Counterparty : ${cp ?? "—"}${cpKn ? `  [${cpKn.label}]` : ""}`);
        lines.push(`${childPx}  TX Hash      : ${tx.hash ?? "(no hash)"}`);
        lines.push(`${childPx}  Date         : ${fmtDate(tx.timestamp ?? "")}`);
        if (tx.memo) lines.push(`${childPx}  ↳ Memo       : ${tx.memo}`);
        if (!isLast) lines.push(childPx);
      });
    }
    lines.push("");

    // ── Trail summary ─────────────────────────────────────────────────────
    lines.push(sepSection("TRAIL SUMMARY"));
    const lastKn = KNOWN_LABELS[lastAddr];
    if (lastKn?.type === "exchange") {
      lines.push(`  ✦ FUNDS SENT TO EXCHANGE`);
      lines.push(`    Exchange : ${lastKn.label}`);
      lines.push(`    Address  : ${lastAddr}`);
      lines.push(`    Action   : File subpoena / KYC request with ${lastKn.label} to obtain account-holder`);
      lines.push(`               identity, IP logs, and transaction records.`);
    } else if (lastKn?.type === "bridge") {
      lines.push(`  ✦ FUNDS CROSSED A BRIDGE — trail continues on destination chain`);
      lines.push(`    Bridge  : ${lastKn.label}`);
      lines.push(`    Address : ${lastAddr}`);
      lines.push(`    Action  : Identify destination chain and continue trace there.`);
    } else {
      lines.push(`  ✦ TRAIL ENDS HERE — final wallet is an unidentified private address`);
      lines.push(`    Address : ${lastAddr}`);
      lines.push(`    Action  : Monitor for future activity. Load full TX history and expand trail.`);
    }
    lines.push("");
    lines.push(`  Victim         : ${walletAddrs[0]}`);
    lines.push(`  Thief          : ${walletAddrs[1]}`);
    lines.push(`  Total Hops     : ${hopData.length}`);
    if (originAmount !== null) {
      lines.push(`  Origin Amount  : ${(originAmount as number).toFixed(8)} ${chainUp} (first hop TX)`);
    }
    lines.push("");

    return auditAndSign(lines, {
      reportType: "Victim → Thief Path Trace Report",
      chain: chainUp,
      target: walletAddrs[0],
      comparisons: walletAddrs.slice(1),
      depth: `${hopData.length} hop${hopData.length !== 1 ? "s" : ""}`,
      walletLabels: true,
    });
  }

  // ── Run Victim → Thief Path Trace ─────────────────────────────────────────
  async function runPathTrace() {
    const steps = pathSteps
      .map(s => ({ wallet: s.wallet.trim(), txHash: s.txHash.trim() }))
      .filter(s => s.wallet);
    if (steps.length < 2) {
      setPathError("Enter at least a victim wallet and a thief wallet.");
      return;
    }
    setPathLoading(true);
    setPathError(null);
    setPathProgress("Starting path analysis…");

    try {
      const hopData: Array<{ from: string; to: string; knownHash: string; tx: Tx | null; allTxs: Tx[] }> = [];

      for (let i = 0; i < steps.length - 1; i++) {
        const fromAddr  = steps[i].wallet;
        const toAddr    = steps[i + 1].wallet;
        const knownHash = steps[i].txHash; // TX hash on the FROM side of this hop
        setPathProgress(`Fetching hop ${i + 1}/${steps.length - 1}…`);

        // Search allTxs (loaded history on current wallet) for matching TXs
        const inLoaded = allTxs.filter(t => {
          const self = t.direction === "in" ? t.to  : t.from;
          const cp   = t.direction === "in" ? t.from : t.to;
          return (self === fromAddr && cp === toAddr) || (self === toAddr && cp === fromAddr);
        });

        let txPool: Tx[] = inLoaded;

        // Also fetch directly from the from-wallet if we don't already have enough
        if (txPool.length === 0 || knownHash) {
          try {
            const resp = await fetch(
              `/api/wallets/${encodeURIComponent(fromAddr)}/transactions?chain=${chain}&limit=50`
            );
            if (resp.ok) {
              const data = await resp.json() as { transactions?: Tx[] };
              const fetched = (data.transactions ?? []).filter(t => {
                const cp = t.direction === "in" ? t.from : t.to;
                return cp === toAddr;
              });
              // Merge: deduplicate by hash
              const seen = new Set(txPool.map(t => t.hash).filter(Boolean));
              txPool = [...txPool, ...fetched.filter(t => !seen.has(t.hash))];
            }
          } catch { /* best-effort */ }
        }

        // Find the primary TX — prefer the user-specified hash; fall back to largest-value match
        let primaryTx: Tx | null = null;
        if (knownHash) {
          primaryTx = txPool.find(t => t.hash === knownHash) ?? null;
          // If not found by hash in the filtered pool, search all of allTxs by hash directly
          if (!primaryTx) {
            primaryTx = allTxs.find(t => t.hash === knownHash) ?? null;
          }
        }
        if (!primaryTx && txPool.length > 0) {
          primaryTx = txPool.reduce((best, t) =>
            parseFloat(t.value) > parseFloat(best.value) ? t : best
          );
        }

        hopData.push({ from: fromAddr, to: toAddr, knownHash, tx: primaryTx, allTxs: txPool });
      }

      // ── Expand from final wallet ─────────────────────────────────────────
      setPathProgress("Fetching final-wallet expansion…");
      const lastAddr = steps[steps.length - 1].wallet;
      let expandTxs: Tx[] = [];
      try {
        // Check allTxs first (already filtered and clean)
        const inLoadedExpand = allTxs.filter(t => {
          const self = t.direction === "in" ? t.to : t.from;
          return self === lastAddr;
        });
        if (inLoadedExpand.length > 0) {
          expandTxs = inLoadedExpand.slice(0, 20);
        } else {
          const resp = await fetch(
            `/api/wallets/${encodeURIComponent(lastAddr)}/transactions?chain=${chain}&limit=25`
          );
          if (resp.ok) {
            const data = await resp.json() as { transactions?: Tx[] };
            expandTxs = (data.transactions ?? []).slice(0, 20);
          }
        }
      } catch { /* best-effort */ }

      setPathProgress("Generating report…");
      const rpt   = generatePathTraceReport(steps, hopData, expandTxs);
      const title = `Victim → Thief Path Trace — ${chain.toUpperCase()} — ${steps[0].wallet.slice(0, 12)}`;
      setReportContent(rpt);
      setReportTitle(title);
      setReportJsonData({
        reportType:    "path-trace",
        generatedAt:   new Date().toISOString(),
        chain,
        victimAddress: steps[0].wallet,
        thiefAddress:  steps[1].wallet,
        pathSteps:     steps,
        hops:          hopData.map(h => ({ from: h.from, to: h.to, knownHash: h.knownHash, txFound: !!h.tx })),
        reportText:    rpt,
      });
      setShowReportModal(true);
    } catch (err) {
      setPathError(err instanceof Error ? err.message : "Analysis failed — try again");
    } finally {
      setPathLoading(false);
      setPathProgress("");
    }
  }

  // Commit new pagination data: sort newest-first, mutate the ref, trigger re-render.
  function commit(txs: Tx[], cursor: string | null, more: boolean) {
    // Apply XLM allowlist at the earliest possible point — before allTxs is ever set.
    // Every downstream consumer (ledger, commingle, trail, exchange flows, etc.) receives
    // only the 8 allowed assets at or above their per-asset minimum amounts.
    const clean = chain === "xlm" ? txs.filter(xlmPassesFilter) : txs;
    const sorted = [...clean].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    page.current.txs = sorted;
    page.current.cursor = cursor;
    page.current.hasMore = more;
    setAllTxs(sorted); // single state update → one React re-render
  }

  // ── Saved wallets (localStorage) ──
  // ── Multi-wallet commingling analysis (declared early so setMultiWallets is in scope for toggleSavedWallet) ──
  const [showMultiPanel, setShowMultiPanel] = useState(false);
  const [multiWallets, setMultiWallets] = useState<string[]>([]);
  const [multiWalletInput, setMultiWalletInput] = useState("");
  const [multiResult, setMultiResult] = useState<MultiAnalysisResult | null>(null);
  const [multiLoading, setMultiLoading] = useState(false);
  const [multiProgress, setMultiProgress] = useState("");
  const [multiError, setMultiError] = useState<string | null>(null);

  // ── Commingle Check ──
  const [showComminglePanel, setShowComminglePanel] = useState(false);
  const [commingleWallets, setCommingleWallets] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("chaintrace-commingle-wallets");
      const all: string[] = raw ? JSON.parse(raw) : [];
      return all.filter((w) => w !== address);
    } catch { return []; }
  });
  const [commingleWalletInput, setCommingleWalletInput] = useState("");
  const [commingleLoading, setCommingleLoading] = useState(false);
  const [commingleProgress, setCommingleProgress] = useState("");
  const [commingleResult, setCommingleResult] = useState<CommingleCheckResult | null>(null);
  const [commingleError, setCommingleError] = useState<string | null>(null);
  const [commingleReportCopied, setCommingleReportCopied] = useState(false);
  const [commingleToast, setCommingleToast] = useState<string | null>(null);
  const [commingleMinAmount, setCommingleMinAmount] = useState(1.0);
  const [commingleMinAmountInput, setCommingleMinAmountInput] = useState("1");
  const comminglePanelRef = useRef<HTMLDivElement>(null);
  const pathPanelRef      = useRef<HTMLDivElement>(null);

  // ── Victim → Thief Path Trace ─────────────────────────────────────────────
  const [showPathPanel,   setShowPathPanel]   = useState(false);
  const [pathSteps,       setPathSteps]       = useState<Array<{wallet:string; txHash:string}>>([{wallet:"",txHash:""},{wallet:"",txHash:""}]);
  const [pathLoading,     setPathLoading]     = useState(false);
  const [pathProgress,    setPathProgress]    = useState("");
  const [pathError,       setPathError]       = useState<string | null>(null);

  const addToCommingle = useCallback((addr: string) => {
    if (!addr) return;
    setCommingleWallets((prev) => {
      if (prev.includes(addr)) return prev;
      const next = [...prev, addr];
      try { localStorage.setItem("chaintrace-commingle-wallets", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    setCommingleToast("Added to Commingle Check");
    setTimeout(() => setCommingleToast(null), 2500);
  }, []);

  const [savedWallets, setSavedWallets] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("chaintrace-saved-wallets");
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const toggleSavedWallet = useCallback((addr: string) => {
    setSavedWallets((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      try { localStorage.setItem("chaintrace-saved-wallets", JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, []);

  // TRACKED: adds counterparty to Multi-Wallet Analysis pool only (not to watchlist/selectedWallets)
  const toggleTracked = useCallback((addr: string) => {
    setMultiWallets((prev) => {
      const removing = prev.includes(addr);
      if (!removing) setShowMultiPanel(true);
      return removing ? prev.filter(a => a !== addr) : [...prev, addr];
    });
  }, []);

  // ── Counterparty context menu ──
  const [activeMenu, setActiveMenu] = useState<{ addr: string; x: number; y: number } | null>(null);

  // ── Trail trace ──
  const [showTrailPanel, setShowTrailPanel] = useState(false);
  const [trailEntries, setTrailEntries] = useState<TrailEntry[]>([]);
  const [showNodeTree, setShowNodeTree] = useState(true);
  const fetchingRef = useRef(new Set<string>());
  const trailPanelRef = useRef<HTMLDivElement>(null);
  const multiPanelRef = useRef<HTMLDivElement>(null);

  // ── Origin Trace (TRACE TO ORIGIN) ──
  const [showOriginPanel, setShowOriginPanel] = useState(false);
  const [originHops, setOriginHops] = useState<OriginHop[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [originMode, setOriginMode] = useState<"standard" | "deep">("standard");
  const [originStatus, setOriginStatus] = useState("");
  const originPanelRef = useRef<HTMLDivElement>(null);
  const originAbortRef = useRef<boolean>(false);

  // (multi-wallet state moved above toggleSavedWallet — see above)

  // ── Blocks React Query background-refetches from overwriting accumulated txs ──
  const txInitializedRef = useRef(false);

  // Initial batch size — derived from chain only, stable per session
  const initLimit = chain === "dag" ? DAG_BATCH : chain === "xrp" ? XRP_INIT : OTHER_BATCH;

  // Close menu on outside click
  useEffect(() => {
    const handler = () => setActiveMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // ── Reset everything when the wallet address, chain, or initLimit changes ──
  useEffect(() => {
    txInitializedRef.current = false;
    page.current = { txs: [], cursor: null, hasMore: false, busy: false, error: null, status: null };
    setAllTxs([]);
    setMinAmount(1);
    setMinAmountInput("1");
    if (address && chain) saveRecentSearch(address, chain);
  }, [address, chain, initLimit]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: wallet, isLoading: walletLoading, error: walletError } = useGetWallet(
    address, { chain },
    { query: { enabled: !!address, queryKey: getGetWalletQueryKey(address, { chain }) } }
  );

  // Initial page — staleTime: Infinity + refetchOnWindowFocus: false prevent background
  // refetches from racing with accumulated Load More state.
  // XLM exception: use staleTime:0 + refetchOnMount:true so a stale empty result (from a
  // previously merged/closed account fetch) is never served permanently — a fresh fetch
  // always runs on navigation. The txInitializedRef guard below prevents accumulated
  // Load More pages from being overwritten by a background re-fetch.
  const xlmChain = chain === "xlm";
  const { data: transactionsData, isLoading: txLoading } = useGetWalletTransactions(
    address, { chain, page: 1, limit: initLimit },
    {
      query: {
        enabled: !!address,
        queryKey: getGetWalletTransactionsQueryKey(address, { chain, page: 1, limit: initLimit }),
        staleTime: xlmChain ? 0 : Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: xlmChain ? true : false,
        refetchOnReconnect: false,
      },
    }
  );
  // Message + explorer link returned by the server when Horizon has no history for this XLM address
  const xlmMessage     = transactionsData?.message     ?? null;
  const xlmHistoryLink = transactionsData?.historyLink ?? null;

  // ── Sync initial React Query page into local state (once per wallet/chain) ──
  // txInitializedRef blocks subsequent RQ background-refetches from overwriting
  // transactions already accumulated by Load More clicks.
  useEffect(() => {
    if (!transactionsData?.transactions || txInitializedRef.current) return;
    txInitializedRef.current = true;
    commit(
      transactionsData.transactions as Tx[],
      transactionsData.nextCursor ?? null,
      transactionsData.hasMore ?? false,
    );
  }, [transactionsData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch one page from the backend ──
  async function fetchPage(cursor: string, limit: number): Promise<{ transactions: Tx[]; nextCursor: string | null; hasMore: boolean }> {
    const url = `/api/wallets/${encodeURIComponent(address)}/transactions?chain=${chain}&limit=${limit}&cursor=${encodeURIComponent(cursor)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 100)}` : ""}`);
    }
    return res.json() as Promise<{ transactions: Tx[]; nextCursor: string | null; hasMore: boolean }>;
  }

  const loadMoreLabel = chain === "dag" ? "LOAD MORE (+250)" : chain === "xrp" ? "LOAD MORE (+500)" : "LOAD MORE (+1000)";

  // ── Load More: fetch one batch, append, re-render ──
  // page.current is always current — no stale closure possible.
  async function loadMore() {
    if (page.current.busy || !page.current.hasMore || !page.current.cursor) return;

    // Snapshot cursor + existing list at call time
    const cursor = page.current.cursor;
    const existing = page.current.txs;

    page.current.busy = true;
    page.current.error = null;
    page.current.status = null;
    setAllTxs([...existing]); // force re-render so button goes to LOADING state

    const limit = chain === "dag" ? DAG_BATCH : chain === "xrp" ? XRP_BATCH : OTHER_BATCH;
    try {
      const data = await fetchPage(cursor, limit);
      const seen = new Set(existing.map((t) => t.hash || `${t.from}:${t.to}:${t.timestamp}`));
      const newTxs = (data.transactions ?? []).filter(
        (t) => !seen.has(t.hash || `${t.from}:${t.to}:${t.timestamp}`)
      );
      const merged = [...existing, ...newTxs]; // append — never replace
      page.current.status = `Added ${newTxs.length} transactions · Total: ${merged.length.toLocaleString()}`;
      commit(merged, data.nextCursor ?? null, data.hasMore && merged.length < MAX_TOTAL);
    } catch (err) {
      page.current.error = err instanceof Error ? err.message : "Unknown error — try again";
      setAllTxs([...existing]); // re-render to show error
    } finally {
      page.current.busy = false;
      setAllTxs([...page.current.txs]); // ensure final re-render with busy=false
    }
  }

  // ── Load All: loop one batch at a time, commit after each page ──
  async function loadAll() {
    if (page.current.busy || !page.current.hasMore || !page.current.cursor) return;
    if (page.current.txs.length > 20000) {
      if (!window.confirm(
        `You already have ${page.current.txs.length.toLocaleString()} transactions.\nLoading more may slow your browser.\n\nContinue?`
      )) return;
    }

    page.current.busy = true;
    page.current.error = null;

    const limit = chain === "dag" ? DAG_BATCH : chain === "xrp" ? XRP_BATCH : OTHER_BATCH;
    let cursor: string | null = page.current.cursor;
    let accumulated = [...page.current.txs];
    let pageNum = 0;

    try {
      while (cursor && accumulated.length < MAX_TOTAL) {
        pageNum++;
        page.current.status = `Loading page ${pageNum} · ${accumulated.length.toLocaleString()} loaded so far…`;
        const liveClean = chain === "xlm" ? accumulated.filter(xlmPassesFilter) : accumulated;
        setAllTxs([...liveClean].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())); // live sorted update

        const data = await fetchPage(cursor, limit);
        const seen = new Set(accumulated.map((t) => t.hash || `${t.from}:${t.to}:${t.timestamp}`));
        const newTxs = (data.transactions ?? []).filter(
          (t) => !seen.has(t.hash || `${t.from}:${t.to}:${t.timestamp}`)
        );
        accumulated = [...accumulated, ...newTxs];
        cursor = data.nextCursor ?? null;
        commit([...accumulated], cursor, data.hasMore && accumulated.length < MAX_TOTAL);
        if (!data.hasMore || !cursor) break;
      }
      page.current.status = `Full history loaded · ${accumulated.length.toLocaleString()} total`;
    } catch (err) {
      page.current.error = err instanceof Error ? err.message : "Unknown error — try again";
    } finally {
      page.current.busy = false;
      setAllTxs([...page.current.txs]);
    }
  }

  // ── Apply minimum amount filter + view mode sort ──
  const filteredTxs = useMemo(() => {
    const base = chain === "xlm"
      ? allTxs.filter(xlmPassesFilter)
      : minAmount <= 0 ? allTxs : allTxs.filter((tx) => parseFloat(tx.value) >= minAmount);
    if (viewMode === "mixed") return base; // already newest-first from commit()
    // Partition into IN, OUT, self — each sub-list is already newest-first (stable after partition)
    const ins = base.filter((t) => t.direction === "in");
    const outs = base.filter((t) => t.direction === "out");
    const self = base.filter((t) => t.direction === "self");
    if (viewMode === "in-first") return [...ins, ...outs, ...self];
    return [...outs, ...ins, ...self]; // out-first
  }, [allTxs, minAmount, viewMode]);

  // ── Group by (address + direction) ──
  const groupedRows = useMemo((): GroupedRow[] => {
    const map = new Map<string, GroupedRow>();
    for (const tx of allTxs) {
      if (tx.direction === "self") continue;
      const cp = tx.direction === "in" ? tx.from : tx.to;
      if (!cp) continue;
      const val = parseFloat(tx.value) || 0;
      if (chain === "xlm" ? !xlmPassesFilter(tx) : val < minAmount) continue;
      const key = `${cp}:${tx.direction}`;
      const existing = map.get(key);
      if (existing) {
        existing.txCount++;
        existing.totalValue += val;
        if (tx.timestamp && tx.timestamp > existing.latestTs) existing.latestTs = tx.timestamp;
      } else {
        map.set(key, {
          address: cp,
          direction: tx.direction as "in" | "out",
          totalValue: val,
          txCount: 1,
          latestTs: tx.timestamp || "",
          asset: tx.tokenSymbol || chain.toUpperCase(),
        });
      }
    }
    const allRows = Array.from(map.values());
    const rows = dirFilter === "only-in"
      ? allRows.filter((r) => r.direction === "in")
      : dirFilter === "only-out"
        ? allRows.filter((r) => r.direction === "out")
        : allRows;
    // Direction grouping (viewMode) as primary, groupSort as secondary within each group
    rows.sort((a, b) => {
      if (viewMode !== "mixed" && a.direction !== b.direction) {
        if (viewMode === "in-first") return a.direction === "in" ? -1 : 1;
        if (viewMode === "out-first") return a.direction === "out" ? -1 : 1;
      }
      if (groupSort === "exchange-first") {
        const aKnown = KNOWN_LABELS[a.address];
        const bKnown = KNOWN_LABELS[b.address];
        const aIsExchange = aKnown?.type === "exchange" ? 0 : aKnown ? 1 : 2;
        const bIsExchange = bKnown?.type === "exchange" ? 0 : bKnown ? 1 : 2;
        if (aIsExchange !== bIsExchange) return aIsExchange - bIsExchange;
        return b.txCount - a.txCount;
      }
      if (groupSort === "most-txs")      return b.txCount - a.txCount;
      if (groupSort === "highest-value") return b.totalValue - a.totalValue;
      return new Date(b.latestTs).getTime() - new Date(a.latestTs).getTime();
    });
    return rows;
  }, [allTxs, minAmount, viewMode, groupSort, chain, dirFilter]);

  // ── Commingling detection ──
  const comminglingAddresses = useMemo(() => {
    const parentSets = new Map<string, Set<string>>();
    for (const e of trailEntries) {
      if (!e.parentAddress) continue;
      if (!parentSets.has(e.address)) parentSets.set(e.address, new Set());
      parentSets.get(e.address)!.add(e.parentAddress);
    }
    return new Set(
      Array.from(parentSets.entries())
        .filter(([, parents]) => parents.size > 1)
        .map(([addr]) => addr)
    );
  }, [trailEntries]);

  // ── Intersection / Commingling Analysis ──
  // Computes all 3 sections purely from data already in memory — no extra API calls.
  const intersectionData = useMemo(() => {
    if (!showTrailPanel || trailEntries.length === 0) return null;
    const rootAddr = trailEntries[0].address;

    // Build per-counterparty stats from loaded transactions
    const cpMap = new Map<string, {
      txCount: number; totalValue: number;
      firstTs: string; lastTs: string;
      sampleHash: string; sampleDate: string;
    }>();
    for (const tx of allTxs) {
      const cp = tx.direction === "in" ? tx.from : (tx.to ?? null);
      if (!cp || cp === rootAddr) continue;
      const v = parseFloat(tx.value) || 0;
      const ex = cpMap.get(cp);
      if (ex) {
        ex.txCount++;
        ex.totalValue += v;
        if (tx.timestamp && tx.timestamp < ex.firstTs) ex.firstTs = tx.timestamp;
        if (tx.timestamp && tx.timestamp > ex.lastTs) {
          ex.lastTs = tx.timestamp;
          ex.sampleHash = tx.hash || ex.sampleHash;
          ex.sampleDate = tx.timestamp;
        }
      } else {
        cpMap.set(cp, {
          txCount: 1, totalValue: v,
          firstTs: tx.timestamp || "", lastTs: tx.timestamp || "",
          sampleHash: tx.hash || "", sampleDate: tx.timestamp || "",
        });
      }
    }

    // § 1 — Direct Intersections: trail nodes whose address also appears in allTxs
    const trailNodes = trailEntries.filter((e) => e.depth > 0);
    const directIntersections = trailNodes
      .filter((e) => cpMap.has(e.address))
      .map((e) => ({ ...e, cp: cpMap.get(e.address)! }))
      .sort((a, b) => b.cp.totalValue - a.cp.totalValue);
    const intersectionAddrs = new Set(directIntersections.map((d) => d.address));

    // § 2 — Common Endpoints: nodes reached via 2+ different parents
    const parentSets = new Map<string, Set<string>>();
    for (const e of trailEntries) {
      if (!e.parentAddress) continue;
      if (!parentSets.has(e.address)) parentSets.set(e.address, new Set());
      parentSets.get(e.address)!.add(e.parentAddress);
    }
    const commonEndpoints = Array.from(parentSets.entries())
      .filter(([, parents]) => parents.size > 1)
      .map(([addr, parents]) => ({
        address: addr,
        parents: Array.from(parents),
        trailEntry: trailEntries.find((e) => e.address === addr),
        cpData: cpMap.get(addr),
      }));

    // § 3 — Numbered Trail Paths: DFS root→leaf, prefer paths with intersections
    const allPaths: string[][] = [];
    const dfs = (addr: string, path: string[]) => {
      const children = trailEntries.filter((e) => e.parentAddress === addr);
      if (children.length === 0) { allPaths.push([...path]); return; }
      for (const c of children) dfs(c.address, [...path, c.address]);
    };
    dfs(rootAddr, [rootAddr]);
    allPaths.sort((a, b) => {
      const score = (p: string[]) =>
        p.filter((addr) => intersectionAddrs.has(addr)).length * 2 +
        p.filter((addr) => commonEndpoints.some((c) => c.address === addr)).length;
      return score(b) - score(a);
    });

    return {
      directIntersections, commonEndpoints,
      paths: allPaths.slice(0, 12),
      intersectionAddrs, rootAddr,
      totalTxsLoaded: allTxs.length,
    };
  }, [showTrailPanel, trailEntries, allTxs]);

  // ── Trail trace ──
  const expandTrailNode = useCallback(async (entry: TrailEntry) => {
    if (fetchingRef.current.has(entry.address) || entry.depth >= 5) return;
    fetchingRef.current.add(entry.address);
    setTrailEntries((prev) =>
      prev.map((e) => e.address === entry.address ? { ...e, isLoading: true } : e)
    );
    try {
      const resp = await fetch(`/api/wallets/${encodeURIComponent(entry.address)}/connections?chain=${chain}`);
      if (!resp.ok) throw new Error("fetch failed");
      const data = await resp.json() as {
        nodes: Array<{ address: string; riskScore: number | null }>;
        edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }>;
        centerAddress: string;
      };
      const peers = (data.nodes || []).filter((n) => n.address !== entry.address).slice(0, 12);
      const edges = data.edges || [];
      setTrailEntries((prev) => {
        const existingAddrs = new Set(prev.map((e) => e.address));
        const updated = prev.map((e) =>
          e.address === entry.address
            ? { ...e, isLoading: false, isExpanded: true, childAddresses: peers.map((p) => p.address) }
            : e
        );
        const newEntries: TrailEntry[] = [];
        for (const peer of peers) {
          if (!existingAddrs.has(peer.address)) {
            const edge = edges.find(
              (ed) =>
                (ed.from === entry.address && ed.to === peer.address) ||
                (ed.to === entry.address && ed.from === peer.address)
            );
            newEntries.push({
              address: peer.address, depth: entry.depth + 1, parentAddress: entry.address,
              knownInfo: KNOWN_LABELS[peer.address],
              isExpanded: false, isLoading: false,
              totalValueUsd: edge?.totalValueUsd ?? 0, txCount: edge?.transactionCount ?? 0,
              childAddresses: [],
            });
          }
        }
        return [...updated, ...newEntries];
      });
    } catch {
      setTrailEntries((prev) =>
        prev.map((e) => e.address === entry.address ? { ...e, isLoading: false, error: true } : e)
      );
    } finally {
      fetchingRef.current.delete(entry.address);
    }
  }, [chain]);

  const startTrailTrace = useCallback(async (targetAddr: string) => {
    setShowTrailPanel(true);
    fetchingRef.current.clear();
    const rootEntry: TrailEntry = {
      address: targetAddr, depth: 0, parentAddress: null,
      knownInfo: KNOWN_LABELS[targetAddr],
      isExpanded: false, isLoading: true,
      totalValueUsd: 0, txCount: 0, childAddresses: [],
    };
    setTrailEntries([rootEntry]);
    try {
      const resp = await fetch(`/api/wallets/${encodeURIComponent(targetAddr)}/connections?chain=${chain}`);
      if (!resp.ok) throw new Error("fetch failed");
      const data = await resp.json() as {
        nodes: Array<{ address: string; riskScore: number | null }>;
        edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }>;
        centerAddress: string;
      };
      const peers = (data.nodes || []).filter((n) => n.address !== targetAddr).slice(0, 12);
      const edges = data.edges || [];
      const rootExpanded: TrailEntry = {
        ...rootEntry, isLoading: false, isExpanded: true,
        childAddresses: peers.map((p) => p.address),
      };
      const peerEntries: TrailEntry[] = peers.map((peer) => {
        const edge = edges.find(
          (ed) =>
            (ed.from === targetAddr && ed.to === peer.address) ||
            (ed.to === targetAddr && ed.from === peer.address)
        );
        return {
          address: peer.address, depth: 1, parentAddress: targetAddr,
          knownInfo: KNOWN_LABELS[peer.address],
          isExpanded: false, isLoading: false,
          totalValueUsd: edge?.totalValueUsd ?? 0, txCount: edge?.transactionCount ?? 0,
          childAddresses: [],
        };
      });
      setTrailEntries([rootExpanded, ...peerEntries]);
    } catch {
      setTrailEntries([{ ...rootEntry, isLoading: false, error: true }]);
    }
    setTimeout(() => {
      trailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }, [chain]);

  const continueTrailOnWallet = useCallback((addr: string) => {
    setActiveMenu(null);
    startTrailTrace(addr);
  }, [startTrailTrace]);

  // ── TRACE TO ORIGIN — reverse source tracing ──
  async function startOriginTrace() {
    originAbortRef.current = false;
    setOriginLoading(true);
    setOriginHops([]);
    setOriginStatus("Initializing…");
    setShowOriginPanel(true);

    const maxHops = originMode === "deep" ? 75 : 30;
    const chainUp = chain.toUpperCase();
    const visited = new Set<string>();
    const hops: OriginHop[] = [];

    // Hop 0: the target wallet itself
    hops.push({
      hop: 0, address, txHash: null, txAmount: "", txAsset: chainUp,
      txTimestamp: "", knownInfo: KNOWN_LABELS[address],
      stopReason: null, isLoading: false,
    });
    setOriginHops([...hops]);
    visited.add(address);

    try {
      for (let i = 0; i < maxHops; i++) {
        if (originAbortRef.current) break;

        const current = hops[hops.length - 1].address;
        setOriginStatus(`Hop ${i + 1}/${maxHops} — scanning ${current.slice(0, 12)}…`);

        // Show loading state on last hop
        hops[hops.length - 1] = { ...hops[hops.length - 1], isLoading: true };
        setOriginHops([...hops]);

        // Fetch transactions for current wallet
        let incoming: Tx[] = [];
        try {
          const url = `/api/wallets/${encodeURIComponent(current)}/transactions?chain=${chain}&limit=50`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json() as { transactions: Tx[] };
          incoming = (data.transactions ?? []).filter(
            (t) => t.direction === "in" && t.from && parseFloat(t.value) > 0
          );
        } catch (err) {
          hops[hops.length - 1] = {
            ...hops[hops.length - 1],
            isLoading: false,
            error: err instanceof Error ? err.message : "Fetch failed",
          };
          setOriginHops([...hops]);
          break;
        }

        // Clear loading state on current hop
        hops[hops.length - 1] = { ...hops[hops.length - 1], isLoading: false };

        if (incoming.length === 0) {
          // Dead end — mark the current last hop
          hops[hops.length - 1] = { ...hops[hops.length - 1], stopReason: "dead-end" };
          setOriginHops([...hops]);
          break;
        }

        // Pick best sender: highest value incoming tx
        incoming.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
        const bestTx = incoming[0];
        const sender = bestTx.from;
        const knownSender = KNOWN_LABELS[sender];

        const isExchange = knownSender?.type === "exchange" || knownSender?.type === "bridge";
        const isLoop     = visited.has(sender);
        const isMaxHops  = i === maxHops - 1;

        const stopReason: OriginHop["stopReason"] =
          isExchange ? "exchange" :
          isLoop     ? "loop" :
          isMaxHops  ? "max-hops" :
          null;

        hops.push({
          hop: i + 1, address: sender,
          txHash: bestTx.hash, txAmount: bestTx.value,
          txAsset: bestTx.tokenSymbol || chainUp,
          txTimestamp: bestTx.timestamp,
          txMemo: bestTx.memo, txDestinationTag: bestTx.destinationTag,
          knownInfo: knownSender, stopReason, isLoading: false,
        });
        setOriginHops([...hops]);

        if (stopReason) break;

        visited.add(sender);
      }
    } finally {
      setOriginLoading(false);
      setOriginStatus("");
      setTimeout(() => originPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }

  // ── Multi-wallet commingling analysis ──
  const runMultiAnalysis = useCallback(async () => {
    const allWallets = [address, ...multiWallets].filter(Boolean);
    if (allWallets.length < 2) {
      setMultiError("Add at least one additional wallet address to compare.");
      return;
    }
    setMultiLoading(true);
    setMultiError(null);
    setMultiResult(null);

    const fetchConns = async (addr: string) => {
      try {
        const resp = await fetch(`/api/wallets/${encodeURIComponent(addr)}/connections?chain=${chain}`);
        if (!resp.ok) return { nodes: [] as Array<{ address: string }>, edges: [] as Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }> };
        return resp.json() as Promise<{ nodes: Array<{ address: string }>; edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }> }>;
      } catch { return { nodes: [], edges: [] }; }
    };

    const EXCL_M = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);
    const isExchM = (a: string) => ["exchange", "bridge", "genesis"].includes(KNOWN_LABELS[a]?.type ?? "");

    try {
      // Build per-wallet map: address → MultiGraphNode (depth 1–4)
      const walletNodeMaps: Array<{ wallet: string; nodes: Map<string, MultiGraphNode> }> = [];

      for (const wallet of allWallets) {
        setMultiProgress(`Depth-1: ${wallet.slice(0, 10)}…`);
        const nodeMap = new Map<string, MultiGraphNode>();

        // ── Depth 1 ─────────────────────────────────────────────────────────
        const d1 = await fetchConns(wallet);
        const d1peers = d1.nodes
          .filter((n) => n.address !== wallet && !allWallets.includes(n.address))
          .slice(0, 12);
        for (const peer of d1peers) {
          const edge = d1.edges.find((e) =>
            (e.from === wallet && e.to === peer.address) || (e.to === wallet && e.from === peer.address));
          nodeMap.set(peer.address, {
            address: peer.address, depth: 1, via: wallet,
            pathChain: [wallet, peer.address],
            txCount: edge?.transactionCount ?? 0, totalValueUsd: edge?.totalValueUsd ?? 0,
          });
        }

        // ── Depth 2: top 6 depth-1 peers in parallel ─────────────────────────
        const top6d1 = d1peers.slice(0, 6);
        const d2results = await Promise.all(top6d1.map((p) => fetchConns(p.address)));
        const d2privateNodes: MultiGraphNode[] = [];
        for (let pi = 0; pi < top6d1.length; pi++) {
          const peer = top6d1[pi];
          setMultiProgress(`Depth-2: ${peer.address.slice(0, 10)}…`);
          const d2 = d2results[pi];
          const d2peers = d2.nodes
            .filter((n) => n.address !== peer.address && !allWallets.includes(n.address))
            .slice(0, 8);
          for (const node of d2peers) {
            if (!nodeMap.has(node.address)) {
              const edge = d2.edges.find((e) =>
                (e.from === peer.address && e.to === node.address) || (e.to === peer.address && e.from === node.address));
              const parentChain = nodeMap.get(peer.address)?.pathChain ?? [peer.address];
              const gn: MultiGraphNode = {
                address: node.address, depth: 2, via: peer.address,
                pathChain: [...parentChain, node.address],
                txCount: edge?.transactionCount ?? 0, totalValueUsd: edge?.totalValueUsd ?? 0,
              };
              nodeMap.set(node.address, gn);
              if (!isExchM(node.address) && !EXCL_M.has(node.address)) d2privateNodes.push(gn);
            }
          }
        }

        // ── Depth 3: top 3 private depth-2 nodes ─────────────────────────────
        const top3d2 = [...d2privateNodes]
          .sort((a, b) => b.txCount - a.txCount)
          .slice(0, 3);
        const d3results = await Promise.all(top3d2.map((p) => fetchConns(p.address)));
        const d3privateNodes: MultiGraphNode[] = [];
        for (let pi = 0; pi < top3d2.length; pi++) {
          const peer = top3d2[pi];
          setMultiProgress(`Depth-3: ${peer.address.slice(0, 10)}…`);
          const d3 = d3results[pi];
          const d3peers = d3.nodes
            .filter((n) => n.address !== peer.address && !allWallets.includes(n.address))
            .slice(0, 6);
          for (const node of d3peers) {
            if (!nodeMap.has(node.address)) {
              const edge = d3.edges.find((e) =>
                (e.from === peer.address && e.to === node.address) || (e.to === peer.address && e.from === node.address));
              const parentChain = nodeMap.get(peer.address)?.pathChain ?? [peer.address];
              const gn: MultiGraphNode = {
                address: node.address, depth: 3, via: peer.address,
                pathChain: [...parentChain, node.address],
                txCount: edge?.transactionCount ?? 0, totalValueUsd: edge?.totalValueUsd ?? 0,
              };
              nodeMap.set(node.address, gn);
              if (!isExchM(node.address) && !EXCL_M.has(node.address)) d3privateNodes.push(gn);
            }
          }
        }

        // ── Depth 4: top 2 private depth-3 nodes ─────────────────────────────
        const top2d3 = [...d3privateNodes]
          .sort((a, b) => b.txCount - a.txCount)
          .slice(0, 2);
        const d4results = await Promise.all(top2d3.map((p) => fetchConns(p.address)));
        for (let pi = 0; pi < top2d3.length; pi++) {
          const peer = top2d3[pi];
          setMultiProgress(`Depth-4: ${peer.address.slice(0, 10)}…`);
          const d4 = d4results[pi];
          const d4peers = d4.nodes
            .filter((n) => n.address !== peer.address && !allWallets.includes(n.address))
            .slice(0, 5);
          for (const node of d4peers) {
            if (!nodeMap.has(node.address)) {
              const edge = d4.edges.find((e) =>
                (e.from === peer.address && e.to === node.address) || (e.to === peer.address && e.from === node.address));
              const parentChain = nodeMap.get(peer.address)?.pathChain ?? [peer.address];
              nodeMap.set(node.address, {
                address: node.address, depth: 4, via: peer.address,
                pathChain: [...parentChain, node.address],
                txCount: edge?.transactionCount ?? 0, totalValueUsd: edge?.totalValueUsd ?? 0,
              });
            }
          }
        }

        walletNodeMaps.push({ wallet, nodes: nodeMap });
      }

      // Aggregate: address → all wallet appearances
      const addressMap = new Map<string, MultiSharedEntry>();
      for (const { wallet, nodes } of walletNodeMaps) {
        for (const [addr, node] of nodes) {
          if (!addressMap.has(addr)) {
            addressMap.set(addr, { address: addr, knownInfo: KNOWN_LABELS[addr], appearances: [] });
          }
          addressMap.get(addr)!.appearances.push({
            wallet, depth: node.depth, txCount: node.txCount,
            totalValueUsd: node.totalValueUsd, via: node.via, pathChain: node.pathChain,
          });
        }
      }

      const shared = Array.from(addressMap.values()).filter((e) => e.appearances.length >= 2);

      const sharedCounterparties = shared
        .filter((s) => s.appearances.some((a) => a.depth === 1))
        .sort((a, b) => b.appearances.length - a.appearances.length || b.appearances.reduce((s, x) => s + x.txCount, 0) - a.appearances.reduce((s, x) => s + x.txCount, 0));

      const commonEndpoints = shared
        .filter((s) => s.appearances.every((a) => a.depth >= 2))
        .sort((a, b) => b.appearances.length - a.appearances.length || b.appearances.reduce((s, x) => s + x.txCount, 0) - a.appearances.reduce((s, x) => s + x.txCount, 0));

      const patterns = shared
        .sort((a, b) => b.appearances.length - a.appearances.length || b.appearances.reduce((s, x) => s + x.txCount, 0) - a.appearances.reduce((s, x) => s + x.txCount, 0))
        .slice(0, 20)
        .map((s, i) => ({
          id: i + 1,
          sharedAddr: s.address,
          knownInfo: s.knownInfo,
          totalTxCount: s.appearances.reduce((sum, a) => sum + a.txCount, 0),
          totalValueUsd: s.appearances.reduce((sum, a) => sum + a.totalValueUsd, 0),
          paths: s.appearances.map((a) => ({
            wallet: a.wallet,
            path: a.pathChain.length > 0 ? a.pathChain : [a.wallet, a.via ?? "?", s.address],
          })),
        }));

      setMultiResult({ trackedWallets: allWallets, sharedCounterparties, commonEndpoints, patterns });
      setTimeout(() => multiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } catch (err) {
      setMultiError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setMultiLoading(false);
      setMultiProgress("");
    }
  }, [address, multiWallets, chain]);

  // ── COMMINGLE CHECK — depth-1 through depth-4 BFS across target + comparison wallets ──
  const runCommingleCheck = useCallback(async () => {
    if (commingleWallets.length === 0) {
      setCommingleError("Add at least one comparison wallet address.");
      return;
    }
    setCommingleLoading(true);
    setCommingleError(null);
    setCommingleResult(null);
    setCommingleProgress("");

    type ReachNode = { path: string[]; tier: number; txCount: number };
    type ReachMap = Map<string, ReachNode>;

    const fetchConns = async (addr: string) => {
      try {
        const resp = await fetch(`/api/wallets/${encodeURIComponent(addr)}/connections?chain=${chain}`);
        if (!resp.ok) return { nodes: [] as Array<{ address: string }>, edges: [] as Array<{ from: string; to: string; transactionCount: number }> };
        return resp.json() as Promise<{ nodes: Array<{ address: string }>; edges: Array<{ from: string; to: string; transactionCount: number }> }>;
      } catch { return { nodes: [], edges: [] }; }
    };

    const buildReachMap = async (wallet: string, label: string): Promise<ReachMap> => {
      const reach: ReachMap = new Map();

      // Hard-excluded: never add to reach map, never expand from.
      const HARD_EXCL = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);

      // Nodes that should appear in the reach map (for exchange-flow detection) but
      // must NEVER be used as expansion seeds — prevents exchange hot wallets from
      // injecting their thousands of counterparties as false "private" connections.
      const isExpandable = (addr: string): boolean => {
        if (HARD_EXCL.has(addr)) return false;
        const kn = KNOWN_LABELS[addr];
        if (!kn) return true;                     // unknown private wallet — expand
        if (kn.type === "dag-team") return true;  // DAG official entity — expand (counts as private)
        return false;                             // exchange / bridge / genesis — DO NOT expand
      };

      setCommingleProgress(`${label}: tier 1…`);
      const d1 = await fetchConns(wallet);
      const tier1 = d1.nodes.filter((n) => n.address !== wallet && !HARD_EXCL.has(n.address)).slice(0, 12);
      for (const n of tier1) {
        const edge = d1.edges.find((e) => (e.from === wallet && e.to === n.address) || (e.to === wallet && e.from === n.address));
        reach.set(n.address, { path: [wallet, n.address], tier: 1, txCount: edge?.transactionCount ?? 0 });
      }

      setCommingleProgress(`${label}: tier 2…`);
      // Only expand from private/dag-team tier-1 nodes — never from exchange/bridge/genesis.
      const t2expand = tier1.filter((n) => isExpandable(n.address)).slice(0, 6);
      const d2results = await Promise.all(t2expand.map((n) => fetchConns(n.address)));
      for (let i = 0; i < t2expand.length; i++) {
        const parent = t2expand[i];
        for (const n of d2results[i].nodes.filter((x) => x.address !== parent.address && x.address !== wallet && !HARD_EXCL.has(x.address)).slice(0, 8)) {
          if (!reach.has(n.address)) {
            const edge = d2results[i].edges.find((e) => (e.from === parent.address && e.to === n.address) || (e.to === parent.address && e.from === n.address));
            reach.set(n.address, { path: [wallet, parent.address, n.address], tier: 2, txCount: edge?.transactionCount ?? 0 });
          }
        }
      }

      setCommingleProgress(`${label}: tier 3…`);
      // Only expand from private/dag-team tier-2 nodes.
      const tier2nodes = Array.from(reach.entries()).filter(([addr, v]) => v.tier === 2 && isExpandable(addr)).slice(0, 4);
      if (tier2nodes.length > 0) {
        const d3results = await Promise.all(tier2nodes.map(([a]) => fetchConns(a)));
        for (let i = 0; i < tier2nodes.length; i++) {
          const [parentAddr, parentData] = tier2nodes[i];
          for (const n of d3results[i].nodes.filter((x) => x.address !== parentAddr && x.address !== wallet && !HARD_EXCL.has(x.address)).slice(0, 6)) {
            if (!reach.has(n.address)) {
              const edge = d3results[i].edges.find((e) => (e.from === parentAddr && e.to === n.address) || (e.to === parentAddr && e.from === n.address));
              reach.set(n.address, { path: [...parentData.path, n.address], tier: 3, txCount: edge?.transactionCount ?? 0 });
            }
          }
        }
      }

      setCommingleProgress(`${label}: tier 4…`);
      // Only expand from private/dag-team tier-3 nodes.
      const tier3nodes = Array.from(reach.entries()).filter(([addr, v]) => v.tier === 3 && isExpandable(addr)).slice(0, 3);
      if (tier3nodes.length > 0) {
        const d4results = await Promise.all(tier3nodes.map(([a]) => fetchConns(a)));
        for (let i = 0; i < tier3nodes.length; i++) {
          const [parentAddr, parentData] = tier3nodes[i];
          for (const n of d4results[i].nodes.filter((x) => x.address !== parentAddr && x.address !== wallet && !HARD_EXCL.has(x.address)).slice(0, 5)) {
            if (!reach.has(n.address)) {
              const edge = d4results[i].edges.find((e) => (e.from === parentAddr && e.to === n.address) || (e.to === parentAddr && e.from === n.address));
              reach.set(n.address, { path: [...parentData.path, n.address], tier: 4, txCount: edge?.transactionCount ?? 0 });
            }
          }
        }
      }

      return reach;
    };

    try {
      setCommingleProgress("Scanning target wallet…");
      const targetReach = await buildReachMap(address, "TARGET");

      const compReachMaps: Array<{ wallet: string; reachMap: ReachMap }> = [];
      for (let i = 0; i < commingleWallets.length; i++) {
        const cw = commingleWallets[i];
        setCommingleProgress(`Scanning comparison wallet ${i + 1}/${commingleWallets.length}…`);
        compReachMaps.push({ wallet: cw, reachMap: await buildReachMap(cw, `COMP ${i + 1}`) });
      }

      const findings: CommingleFinding[] = [];
      for (const [addr, targetData] of targetReach) {
        const matchingComps = compReachMaps
          .filter(({ reachMap }) => reachMap.has(addr))
          .map(({ wallet: cw, reachMap }) => ({ wallet: cw, path: reachMap.get(addr)!.path }));
        if (matchingComps.length > 0) {
          findings.push({
            sharedAddress: addr,
            knownInfo: KNOWN_LABELS[addr],
            tier: targetData.tier,
            targetPath: targetData.path,
            comparisons: matchingComps,
            txCountTarget: targetData.txCount,
          });
        }
      }

      findings.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        // Unknown private wallets first (rank 0), dag-team second (rank 1),
        // exchange/bridge/genesis last (rank 2) — they appear in a separate section anyway.
        const rank = (f: CommingleFinding) => {
          if (!f.knownInfo) return 0;
          if (f.knownInfo.type === "dag-team") return 1;
          return 2; // exchange / bridge / genesis
        };
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return b.txCountTarget - a.txCountTarget;
      });

      const tieredCounts: [number, number, number, number] = [
        findings.filter((f) => f.tier === 1).length,
        findings.filter((f) => f.tier === 2).length,
        findings.filter((f) => f.tier === 3).length,
        findings.filter((f) => f.tier === 4).length,
      ];

      // ── Fetch best TX for each intermediate hop segment ────────────────────────
      // Intermediate = path positions 1 .. length-2 (between target and shared node).
      // Segments involving the target wallet itself are already in allTxs (bestInOut).
      setCommingleProgress("Fetching intermediate hop TX details…");
      const intermedWallets = new Set<string>();
      for (const finding of findings) {
        for (let i = 1; i < finding.targetPath.length - 1; i++) {
          intermedWallets.add(finding.targetPath[i]);
        }
      }
      const segmentTxs: Record<string, Tx | null> = {};
      const hopFetchStats: Record<string, { pages: number; txs: number; rateLimitEvents?: number; failReason?: string }> = {};
      if (intermedWallets.size > 0) {
        // Paginating hop fetch — up to 125 pages × 200 ops each (25 000 ops per hop wallet).
        // Wallets are fetched SERIALLY (not parallel) to avoid saturating Stellar Horizon's
        // 60 req/min limit. A 1 200 ms inter-page delay keeps us well under that cap.
        // On HTTP 429 the page is retried after honoring the Retry-After header (min 2 000 ms).
        const hopSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

        const fetchHopPages = async (
          fromAddr: string,
        ): Promise<{ pages: number; txs: number; rateLimitEvents?: number; failReason?: string }> => {
          const trimmed = fromAddr.trim();
          if (!trimmed) return { pages: 0, txs: 0, failReason: "empty address" };

          let cursor: string | null = null;
          let pagesUsed = 0;
          let txsTotal = 0;
          let rateLimitEvents = 0;
          let failReason: string | undefined;

          for (let p = 0; p < 125; p++) {
            let resp: Response;
            try {
              const qs = new URLSearchParams({ chain, limit: "200" });
              if (cursor) qs.set("cursor", cursor);
              resp = await fetch(`/api/wallets/${encodeURIComponent(trimmed)}/transactions?${qs}`);
            } catch (e) {
              failReason = `network error on page ${p + 1}: ${e instanceof Error ? e.message : String(e)}`;
              break;
            }

            // Rate-limited: wait the server-specified delay then retry the same page.
            if (resp.status === 429) {
              const retryHeader = resp.headers.get("Retry-After");
              const waitMs = retryHeader ? Math.max(parseInt(retryHeader, 10) * 1000, 2000) : 2000;
              rateLimitEvents++;
              await hopSleep(waitMs);
              p--; // retry same page number on next iteration
              continue;
            }

            if (!resp.ok) {
              let body = "";
              try { body = await resp.text(); } catch { /* ignore */ }
              failReason = `HTTP ${resp.status} on page ${p + 1}${body ? `: ${body.slice(0, 120)}` : ""}`;
              break;
            }

            let data: { transactions?: Tx[]; nextCursor?: string | null };
            try {
              data = await resp.json() as { transactions?: Tx[]; nextCursor?: string | null };
            } catch (e) {
              failReason = `JSON parse error on page ${p + 1}: ${e instanceof Error ? e.message : String(e)}`;
              break;
            }

            const pageTxs = data.transactions ?? [];
            pagesUsed++;
            txsTotal += pageTxs.length;

            for (const tx of pageTxs) {
              // NOTE: intentionally NO xlmPassesFilter here — segmentTxs must capture
              // connecting transactions regardless of asset type (DEX tokens, path payments,
              // non-allowlisted assets all count as real connections between wallets).
              const counterparty = tx.direction === "in" ? tx.from : tx.to;
              if (!counterparty) continue;
              for (const key of [`${trimmed}::${counterparty}`, `${counterparty}::${trimmed}`]) {
                const prev = segmentTxs[key];
                if (!prev || parseFloat(tx.value) > parseFloat(prev.value ?? "0")) {
                  segmentTxs[key] = tx;
                }
              }
            }

            cursor = data.nextCursor ?? null;
            // Break before sleeping if there is no next page.
            if (!cursor) break;
            // 1 200 ms between pages — keeps requests well under Horizon's 60/min limit.
            await hopSleep(1200);
          }

          return {
            pages: pagesUsed,
            txs: txsTotal,
            ...(rateLimitEvents > 0 ? { rateLimitEvents } : {}),
            ...(failReason ? { failReason } : {}),
          };
        };

        // Serial wallet loop — one wallet at a time so all page requests share
        // the same rate-limit budget instead of exhausting it in parallel.
        for (const w of Array.from(intermedWallets).slice(0, 20)) {
          hopFetchStats[w] = await fetchHopPages(w);
        }
      }

      // Fetch transactions for every cluster wallet and detect exchange flows directly.
      // KEY: scan RAW (unfiltered) txs so no asset/amount filter hides exchange outflows.
      // Paginate through multiple Horizon pages — the server returns at most 200 ops per
      // call (Stellar Horizon hard limit), so a single fetch misses older exchange txs.
      setCommingleProgress("Scanning cluster wallet transactions for exchange flows…");
      const walletTxs: Record<string, Tx[]> = {};
      const EXCH_TYPES_SCAN = new Set(["exchange", "bridge", "genesis"]);
      // key = "exchAddr::sourceWallet"
      const exchFlowsMap = new Map<string, {
        exchAddr: string; exchLabel: string; exchType: string;
        sourceWallet: string; txs: Tx[];
      }>();

      // Paginating fetch — follows nextCursor for up to maxPages pages of 200 ops each.
      // All wallets run in parallel; pages within each wallet are sequential.
      const fetchPagesForExch = async (w: string, maxPages: number): Promise<Tx[]> => {
        const acc: Tx[] = [];
        let cursor: string | null = null;
        for (let p = 0; p < maxPages; p++) {
          try {
            const qs = new URLSearchParams({ chain, limit: "200" });
            if (cursor) qs.set("cursor", cursor);
            const resp = await fetch(`/api/wallets/${encodeURIComponent(w)}/transactions?${qs}`);
            if (!resp.ok) break;
            const data = await resp.json() as {
              transactions?: Tx[]; nextCursor?: string | null; hasMore?: boolean;
            };
            acc.push(...(data.transactions ?? []));
            if (!data.hasMore || !data.nextCursor) break;
            cursor = data.nextCursor;
          } catch { break; }
        }
        return acc;
      };

      // target wallet: 10 pages (up to 2 000 ops); each comparison wallet: 5 pages (1 000 ops)
      const clusterFetch = [
        { w: address, maxPages: 10 },
        ...commingleWallets.map((cw) => ({ w: cw, maxPages: 5 })),
      ];
      await Promise.allSettled(
        clusterFetch.map(async ({ w, maxPages }) => {
          const rawTxs = await fetchPagesForExch(w, maxPages);
          // Filtered set for display (walletTxs)
          const filtered = rawTxs.filter((tx) => chain === "xlm" ? xlmPassesFilter(tx) : true);
          if (filtered.length > 0) walletTxs[w] = filtered;
          // Exchange detection — scan every raw tx, both from and to, no amount filter
          for (const tx of rawTxs) {
            if (tx.direction === "self") continue;
            const candidates = [tx.from, tx.to].filter((a): a is string => !!a && a !== w);
            for (const candidate of candidates) {
              const info = KNOWN_LABELS[candidate];
              if (!info || !EXCH_TYPES_SCAN.has(info.type)) continue;
              const key = `${candidate}::${w}`;
              if (!exchFlowsMap.has(key)) {
                exchFlowsMap.set(key, {
                  exchAddr: candidate, exchLabel: info.label, exchType: info.type,
                  sourceWallet: w, txs: [],
                });
              }
              exchFlowsMap.get(key)!.txs.push(tx);
            }
          }
        })
      );
      // Supplement from reach-map tier-1 (bidirectional exchange nodes that appear in the
      // connections graph even if not in the recent tx fetch window)
      for (const [addr, data] of targetReach) {
        if (data.tier !== 1) continue;
        const info = KNOWN_LABELS[addr];
        if (!info || !EXCH_TYPES_SCAN.has(info.type)) continue;
        const key = `${addr}::${address}`;
        if (!exchFlowsMap.has(key)) {
          exchFlowsMap.set(key, { exchAddr: addr, exchLabel: info.label, exchType: info.type, sourceWallet: address, txs: [] });
        }
      }
      for (const { wallet: cw, reachMap } of compReachMaps) {
        for (const [addr, data] of reachMap) {
          if (data.tier !== 1) continue;
          const info = KNOWN_LABELS[addr];
          if (!info || !EXCH_TYPES_SCAN.has(info.type)) continue;
          const key = `${addr}::${cw}`;
          if (!exchFlowsMap.has(key)) {
            exchFlowsMap.set(key, { exchAddr: addr, exchLabel: info.label, exchType: info.type, sourceWallet: cw, txs: [] });
          }
        }
      }

      // Supplement from segmentTxs — hop wallet transactions fetched by fetchHopPages.
      // These cover cases where an INTERMEDIATE wallet (not target/comparison) sent to or
      // received from a known exchange (e.g. GAZSPN → Kraken, GD6OZZ → Coinbase Deposits).
      // segmentTxs stores both "fa::ta" and "ta::fa" for the same TX; we deduplicate via
      // exchFlowsMap.has() before inserting.
      for (const segKey of Object.keys(segmentTxs)) {
        const sep = segKey.indexOf("::");
        if (sep < 0) continue;
        const fa = segKey.slice(0, sep);
        const ta = segKey.slice(sep + 2);
        // Check both sides — either the fa or ta could be the exchange address.
        for (const [exchAddr, srcAddr] of [[fa, ta], [ta, fa]] as [string, string][]) {
          const info = KNOWN_LABELS[exchAddr];
          if (!info || !EXCH_TYPES_SCAN.has(info.type)) continue;
          // srcAddr is the hop wallet that transacted with the exchange.
          const flowKey = `${exchAddr}::${srcAddr}`;
          if (!exchFlowsMap.has(flowKey)) {
            const tx = segmentTxs[segKey];
            exchFlowsMap.set(flowKey, {
              exchAddr,
              exchLabel: info.label,
              exchType:  info.type,
              sourceWallet: srcAddr,
              txs: tx ? [tx] : [],
            });
          }
        }
      }

      const exchFlows = [...exchFlowsMap.values()];

      setCommingleResult({
        targetWallet: address,
        comparisonWallets: commingleWallets,
        chain,
        scannedAt: new Date().toISOString(),
        findings,
        tieredCounts,
        totalScanned: targetReach.size,
        segmentTxs,
        hopFetchStats,
        walletTxs,
        exchFlows,
      });
      setTimeout(() => comminglePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } catch (err) {
      setCommingleError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setCommingleLoading(false);
      setCommingleProgress("");
    }
  }, [address, commingleWallets, chain]);

  // ── Helpers ──
  const getRiskBadge = (score: number | null) => {
    if (score === null)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono"><Shield className="w-3 h-3" /> UNSCORED</span>;
    if (score <= 30)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-950/60 text-green-400 font-mono"><ShieldCheck className="w-3 h-3" /> LOW RISK ({score})</span>;
    if (score <= 70)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-yellow-950/60 text-yellow-400 font-mono"><ShieldAlert className="w-3 h-3" /> MED RISK ({score})</span>;
    return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-950/60 text-red-400 font-mono"><ShieldAlert className="w-3 h-3" /> HIGH RISK ({score})</span>;
  };

  const getKnownBadge = (info?: { label: string; type: string }, size: "sm" | "md" | "lg" = "sm") => {
    if (!info) return null;
    const lbl = info.label.toLowerCase();
    const typeDefaults: Record<string, { bg: string; border: string; glow: string; ring: string; emoji: string }> = {
      exchange: { bg: "bg-blue-600/95",    border: "border-blue-300/70",    glow: "shadow-blue-500/50",    ring: "ring-1 ring-blue-400/40",    emoji: "🏦" },
      genesis:  { bg: "bg-purple-700/95",  border: "border-purple-300/80",  glow: "shadow-purple-400/40",  ring: "ring-1 ring-purple-400/30",  emoji: "⚡" },
      defi:     { bg: "bg-teal-700/95",    border: "border-teal-300/80",    glow: "shadow-teal-400/40",    ring: "ring-1 ring-teal-400/30",    emoji: "🔄" },
      flagged:  { bg: "bg-red-600/95",     border: "border-red-300/80",     glow: "shadow-red-400/40",     ring: "ring-1 ring-red-400/30",     emoji: "🚨" },
      bridge:   { bg: "bg-amber-600/95",   border: "border-amber-300/80",   glow: "shadow-amber-400/40",   ring: "ring-1 ring-amber-400/30",   emoji: "🌉" },
      "dag-team": { bg: "bg-orange-600/95", border: "border-orange-300/80", glow: "shadow-orange-400/40",  ring: "ring-1 ring-orange-400/30",  emoji: "🏛️" },
    };
    const exchangeThemes: Array<[RegExp, { bg: string; border: string; glow: string; ring: string; emoji: string }]> = [
      [/uphold/,     { bg: "bg-red-600/95",      border: "border-red-300/70",      glow: "shadow-red-500/60",      ring: "ring-1 ring-red-400/50",      emoji: "🔴" }],
      [/kraken/,     { bg: "bg-orange-600/95",    border: "border-orange-300/70",   glow: "shadow-orange-500/60",   ring: "ring-1 ring-orange-400/50",   emoji: "🟠" }],
      [/coinbase/,   { bg: "bg-blue-600/95",      border: "border-blue-300/70",     glow: "shadow-blue-500/60",     ring: "ring-1 ring-blue-400/50",     emoji: "🔵" }],
      [/okx/,        { bg: "bg-purple-600/95",    border: "border-purple-300/70",   glow: "shadow-purple-500/60",   ring: "ring-1 ring-purple-400/50",   emoji: "🟣" }],
      [/binance/,    { bg: "bg-yellow-500/95",    border: "border-yellow-300/70",   glow: "shadow-yellow-500/60",   ring: "ring-1 ring-yellow-400/50",   emoji: "🟡" }],
      [/gemini/,     { bg: "bg-emerald-600/95",   border: "border-emerald-300/70",  glow: "shadow-emerald-500/60",  ring: "ring-1 ring-emerald-400/50",  emoji: "💎" }],
      [/crypto\.com|crypto_com/,
                     { bg: "bg-sky-600/95",        border: "border-sky-300/70",      glow: "shadow-sky-500/60",      ring: "ring-1 ring-sky-400/50",      emoji: "🔷" }],
      [/bitstamp/,   { bg: "bg-cyan-600/95",      border: "border-cyan-300/70",     glow: "shadow-cyan-500/60",     ring: "ring-1 ring-cyan-400/50",     emoji: "🏦" }],
      [/bitfinex/,   { bg: "bg-teal-600/95",      border: "border-teal-300/70",     glow: "shadow-teal-500/60",     ring: "ring-1 ring-teal-400/50",     emoji: "🏦" }],
      [/huobi/,      { bg: "bg-amber-600/95",     border: "border-amber-300/70",    glow: "shadow-amber-500/60",    ring: "ring-1 ring-amber-400/50",    emoji: "🏦" }],
      [/bybit/,      { bg: "bg-violet-600/95",    border: "border-violet-300/70",   glow: "shadow-violet-500/60",   ring: "ring-1 ring-violet-400/50",   emoji: "🏦" }],
      [/kucoin/,     { bg: "bg-green-600/95",     border: "border-green-300/70",    glow: "shadow-green-500/60",    ring: "ring-1 ring-green-400/50",    emoji: "🟢" }],
      [/mexc/,       { bg: "bg-lime-600/95",      border: "border-lime-300/70",     glow: "shadow-lime-500/60",     ring: "ring-1 ring-lime-400/50",     emoji: "🟢" }],
      [/gate/,       { bg: "bg-rose-600/95",      border: "border-rose-300/70",     glow: "shadow-rose-500/60",     ring: "ring-1 ring-rose-400/50",     emoji: "🏛️" }],
      [/bitmex/,     { bg: "bg-red-700/95",       border: "border-red-300/70",      glow: "shadow-red-500/60",      ring: "ring-1 ring-red-400/50",      emoji: "🏦" }],
      [/robinhood/,  { bg: "bg-green-600/95",     border: "border-green-300/70",    glow: "shadow-green-500/60",    ring: "ring-1 ring-green-400/50",    emoji: "🏦" }],
    ];
    const base = typeDefaults[info.type] ?? typeDefaults.exchange;
    const exchangeOverride = info.type === "exchange"
      ? (exchangeThemes.find(([rx]) => rx.test(lbl))?.[1] ?? null)
      : null;
    const c = { text: "text-white", ...base, ...(exchangeOverride ?? {}) };
    const sz = size === "lg"
      ? "text-sm px-3.5 py-1.5 gap-2 rounded-lg font-extrabold tracking-wide shadow-lg"
      : size === "md"
      ? "text-xs px-2.5 py-1 gap-1.5 rounded-md font-bold shadow-md"
      : "text-[11px] px-2 py-0.5 gap-1 rounded font-bold shadow-sm";
    return (
      <span className={`inline-flex items-center shrink-0 font-mono border ${sz} ${c.bg} ${c.text} ${c.border} ${c.ring} shadow-sm ${c.glow}`}>
        <span>{c.emoji}</span>
        <span>{info.label}</span>
      </span>
    );
  };

  const renderCounterpartyCell = (addr: string | null, dir: string) => {
    if (!addr) {
      return dir === "out"
        ? <span className="text-muted-foreground text-xs">CONTRACT CREATION</span>
        : <span className="text-muted-foreground text-xs">—</span>;
    }
    const known = KNOWN_LABELS[addr];
    const saved = savedWallets.has(addr);
    const explorerAddrUrl = WALLET_EXPLORER_MAP[chain];
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setActiveMenu({ addr, x: rect.left, y: rect.bottom + 4 });
          }}
          className="text-primary/80 hover:text-primary text-xs hover:underline transition-colors font-mono"
          title={addr}
        >
          {addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr}
        </button>
        {known && getKnownBadge(known, "md")}
        {saved && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
        {explorerAddrUrl && (
          <a
            href={explorerAddrUrl(addr)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); addToCommingle(addr); }}
          className={`transition-colors shrink-0 ${commingleWallets.includes(addr) ? "text-purple-400" : "text-muted-foreground/40 hover:text-purple-400"}`}
          title={commingleWallets.includes(addr) ? "In Commingle Check" : "Add to Commingle Check"}
        >
          <GitMerge className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  };

  const explorerTxUrl = EXPLORER_MAP[chain];

  if (walletError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-destructive opacity-40" />
        <h2 className="text-xl font-mono text-destructive tracking-widest">PROFILE NOT FOUND</h2>
        <p className="text-muted-foreground text-sm max-w-md font-mono">
          Target address could not be resolved on the{" "}
          <span className="text-primary uppercase">{chain}</span> network.
        </p>
        <Link href="/">
          <Button variant="outline" className="font-mono mt-4 tracking-wider">RETURN TO SEARCH</Button>
        </Link>
      </div>
    );
  }

  const inCount = filteredTxs.filter((t) => t.direction === "in").length;
  const outCount = filteredTxs.filter((t) => t.direction === "out").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" onClick={() => setActiveMenu(null)}>

      {/* ── Commingle toast ── */}
      {commingleToast && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 bg-purple-900/95 border border-purple-500/50 rounded-lg shadow-xl shadow-black/40 text-purple-200 text-xs font-mono pointer-events-none">
          <GitMerge className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          {commingleToast}
        </div>
      )}

      {/* ── Counterparty context menu ── */}
      {activeMenu && (
        <div
          className="fixed z-50 bg-card border border-border/60 rounded-lg shadow-xl shadow-black/40 overflow-hidden min-w-[220px]"
          style={{ top: Math.min(activeMenu.y, window.innerHeight - 160), left: Math.min(activeMenu.x, window.innerWidth - 240) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border/40 bg-muted/20">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Counterparty</p>
            <p className="text-xs font-mono text-primary truncate max-w-[200px]">{activeMenu.addr}</p>
          </div>
          <div className="p-1">
            <button
              onClick={() => { setActiveMenu(null); setLocation(`/wallet/${activeMenu.addr}?chain=${chain}`); }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center gap-2"
            >
              <Network className="w-3 h-3 text-muted-foreground" /> View Profile
            </button>
            <button
              onClick={() => continueTrailOnWallet(activeMenu.addr)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-primary hover:bg-primary/10 rounded-md transition-colors flex items-center gap-2"
            >
              <GitFork className="w-3 h-3" /> Continue Trail on this Wallet
            </button>
            <button
              onClick={() => { addToCommingle(activeMenu.addr); setActiveMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-purple-400 hover:bg-purple-950/30 rounded-md transition-colors flex items-center gap-2"
            >
              <GitMerge className="w-3 h-3" /> Add to Commingle Check
            </button>
            <button
              onClick={() => { toggleSavedWallet(activeMenu.addr); setActiveMenu(null); }}
              className={`w-full text-left px-3 py-2 text-xs font-mono rounded-md transition-colors flex items-center gap-2 ${
                savedWallets.has(activeMenu.addr)
                  ? "text-yellow-400 hover:bg-yellow-950/30"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {savedWallets.has(activeMenu.addr)
                ? <><BookmarkCheck className="w-3 h-3" /> Remove from Saved</>
                : <><Bookmark className="w-3 h-3" /> Save / Add to Trail Wallet</>
              }
            </button>
            <a
              href={WALLET_EXPLORER_MAP[chain]?.(activeMenu.addr) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setActiveMenu(null)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center gap-2 block"
            >
              <ExternalLink className="w-3 h-3" /> Open in Explorer
            </a>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-3">
        {/* ── Badges row ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded uppercase border border-primary/20">{chain}</span>
          {walletLoading ? <div className="w-28 h-5 bg-muted/50 rounded animate-pulse" /> : getRiskBadge(wallet?.riskScore ?? null)}
          {wallet?.isContract && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-950/50 text-blue-400 text-xs font-mono rounded border border-blue-500/20">
              <FileCode className="w-3 h-3" /> CONTRACT
            </span>
          )}
          {wallet?.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded">
              <Tag className="w-3 h-3" /> {tag.toUpperCase()}
            </span>
          ))}
          {KNOWN_LABELS[address] && getKnownBadge(KNOWN_LABELS[address], "lg")}
          {savedWallets.has(address) && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-950/50 text-yellow-400 text-xs font-mono rounded border border-yellow-500/20">
              <Bookmark className="w-3 h-3 fill-yellow-400" /> SAVED
            </span>
          )}
        </div>
        {/* ── Full-width address box ── */}
        <div className="font-mono text-sm text-foreground bg-muted/20 px-3 py-2 rounded border border-border/40">
          <AddressDisplay address={address} truncate={false} showIcon />
        </div>
        {/* ── Action buttons row ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              className={`font-mono text-xs ${
                savedWallets.has(address)
                  ? "border-yellow-500/50 text-yellow-400 hover:bg-yellow-950/30 bg-yellow-950/20"
                  : "border-border/40 text-muted-foreground hover:border-yellow-500/50 hover:text-yellow-400"
              }`}
              onClick={() => toggleSavedWallet(address)}
            >
              {savedWallets.has(address)
                ? <><BookmarkCheck className="w-3.5 h-3.5 mr-1.5" /> WATCHLISTED</>
                : <><Bookmark className="w-3.5 h-3.5 mr-1.5" /> ADD TO WATCHLIST</>
              }
            </Button>
            <Link href={`/trace/${address}?chain=${chain}`}>
              <Button variant="outline" className="font-mono border-primary/30 text-primary hover:bg-primary/10 text-xs">
                <Network className="w-3.5 h-3.5 mr-1.5" /> TRACE GRAPH
              </Button>
            </Link>
            <Button
              variant="outline"
              className={`font-mono text-xs ${showMultiPanel ? "border-violet-500/60 text-violet-300 bg-violet-950/30 hover:bg-violet-950/50" : "border-violet-500/30 text-violet-400 hover:bg-violet-950/30 hover:border-violet-500/60"}`}
              onClick={() => { setShowMultiPanel((v) => !v); if (!showMultiPanel) setTimeout(() => multiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }}
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" /> INTERSECTION / FUNNEL
            </Button>
            <Button
              variant="outline"
              className={`font-mono text-xs ${showComminglePanel ? "border-amber-500/60 text-amber-300 bg-amber-950/30 hover:bg-amber-950/50" : "border-amber-500/30 text-amber-400 hover:bg-amber-950/30 hover:border-amber-500/60"}`}
              onClick={() => { setShowComminglePanel((v) => !v); if (!showComminglePanel) setTimeout(() => comminglePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }}
            >
              <GitMerge className="w-3.5 h-3.5 mr-1.5" /> COMMINGLE CHECK
            </Button>
            <Button
              variant="outline"
              className={`font-mono text-xs ${showPathPanel ? "border-rose-500/60 text-rose-300 bg-rose-950/30 hover:bg-rose-950/50" : "border-rose-500/30 text-rose-400 hover:bg-rose-950/30 hover:border-rose-500/60"}`}
              title="Trace funds from victim to thief hop-by-hop with taint analysis"
              onClick={() => { setShowPathPanel((v) => !v); if (!showPathPanel) setTimeout(() => pathPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }}
            >
              <Route className="w-3.5 h-3.5 mr-1.5" /> VICTIM → THIEF PATH
            </Button>
            <Button
              variant="outline"
              className="font-mono text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-500/70 hover:text-emerald-300"
              title="Generate a report of all exchange, bridge, and protocol transactions"
              onClick={() => {
                const rpt = generateExchangeFlowsReport();
                const title = `Exchange Flows Report — ${chain.toUpperCase()} — ${address.slice(0, 12)}`;
                setReportContent(rpt);
                setReportTitle(title);
                setReportJsonData({ reportType: "exchange-flows", generatedAt: new Date().toISOString(), chain, subjectAddress: address, walletInfo: wallet, selectedAddresses: [], reportText: rpt });
                setShowReportModal(true);
              }}
            >
              <Landmark className="w-3.5 h-3.5 mr-1.5" /> EXCHANGE FLOWS
            </Button>
            <Button
              variant="outline"
              className="font-mono text-xs border-purple-500/30 text-purple-400 hover:bg-purple-950/30 hover:border-purple-500/60"
              onClick={() => {
                try {
                  const raw = localStorage.getItem("chaintrace-commingle-wallets");
                  const existing: string[] = raw ? JSON.parse(raw) : [];
                  if (!existing.includes(address)) {
                    localStorage.setItem("chaintrace-commingle-wallets", JSON.stringify([...existing, address]));
                  }
                } catch { /* noop */ }
                setCommingleToast("Wallet saved — open Commingle Check on any profile to compare");
                setTimeout(() => setCommingleToast(null), 3000);
              }}
              title="Save this wallet address into your Commingle Check comparison list"
            >
              <GitMerge className="w-3.5 h-3.5 mr-1.5" /> ADD TO COMMINGLE
            </Button>
            <Button
              variant="outline"
              className={`font-mono text-xs ${showOriginPanel ? "border-cyan-500/60 text-cyan-300 bg-cyan-950/30 hover:bg-cyan-950/50" : "border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-500/60"}`}
              onClick={() => { setShowOriginPanel((v) => !v); if (!showOriginPanel) setTimeout(() => originPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> TRACE TO ORIGIN
            </Button>
            <Button
              className="font-mono bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
              onClick={() => startTrailTrace(address)}
            >
              <GitFork className="w-3.5 h-3.5 mr-1.5" /> START TRAIL TRACE
            </Button>
          </div>
          {/* ── Selection badge + Generate Report ── */}
          {selectedWallets.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-950/40 border border-orange-500/30 rounded text-[11px] font-mono text-orange-300">
                <Flag className="w-3 h-3 fill-orange-400 text-orange-400" />
                <span>{selectedWallets.size} wallet{selectedWallets.size !== 1 ? "s" : ""} selected</span>
                <button onClick={clearSelected} className="ml-1 text-orange-400/60 hover:text-orange-300 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <Button
                className="font-mono text-xs bg-orange-600 hover:bg-orange-500 text-white border-0"
                onClick={() => {
                  const rpt = generateReport();
                  const title = `Investigative Report — ${chain.toUpperCase()} — ${address.slice(0, 12)}`;
                  setReportContent(rpt);
                  setReportTitle(title);
                  setReportJsonData({ reportType: "investigative", generatedAt: new Date().toISOString(), chain, subjectAddress: address, walletInfo: wallet, selectedAddresses: [...selectedWallets], reportText: rpt });
                  setShowReportModal(true);
                }}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" /> GENERATE INVESTIGATIVE REPORT
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Support Banner ── */}
      <div className="rounded-lg border border-pink-500/30 bg-gradient-to-r from-pink-950/30 via-pink-950/20 to-transparent overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-pink-500/15 border border-pink-500/30 flex items-center justify-center mt-0.5">
              <Heart className="w-4 h-4 text-pink-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-bold text-pink-300 tracking-wide mb-0.5">
                Support This Free Tool
              </p>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                <span className="text-pink-400">100% free</span> — no fees, ads, or data selling. If CryptoChainTrace helped your investigation, even a small donation keeps the servers running.
              </p>
            </div>
            <button
              onClick={() => setShowDonate((v) => !v)}
              className="shrink-0 text-[10px] font-mono text-pink-400 hover:text-pink-300 border border-pink-500/30 hover:border-pink-400/60 bg-pink-950/40 hover:bg-pink-950/60 px-3 py-1.5 rounded transition-colors font-semibold tracking-wider"
            >
              {showDonate ? "HIDE ↑" : "DONATE ↓"}
            </button>
          </div>
          {showDonate && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { symbol: "XLM", label: "Stellar",  address: "GCXUMH47OGMC6JKUCMNG5KSKUOZGX7H4A6P2YZTZ2FCA2ZEB2PPSB6XW", color: "text-sky-300",    bg: "bg-sky-950/30",    border: "border-sky-500/25" },
                { symbol: "XRP", label: "Ripple",   address: "rHm4Erz4urYGqvssR6Rs8DwsQkDeEQwxuV",                          color: "text-cyan-300",   bg: "bg-cyan-950/30",   border: "border-cyan-500/25" },
                { symbol: "BTC", label: "Bitcoin",  address: "bc1q3k20tfjatu8prsszr9jmtyayj665af2aavfeyt",                   color: "text-orange-300", bg: "bg-orange-950/30", border: "border-orange-500/25" },
                { symbol: "ETH", label: "Ethereum", address: "0x0b3E9efb09Ead589F9F4c957228eE5E45B286d55",                  color: "text-blue-300",   bg: "bg-blue-950/30",   border: "border-blue-500/25" },
              ] as { symbol: string; label: string; address: string; color: string; bg: string; border: string }[]).map((d) => (
                <div key={d.symbol} className={`flex items-center gap-3 ${d.bg} border ${d.border} px-3 py-2.5 rounded-lg`}>
                  <div className="shrink-0 text-center w-10">
                    <span className={`text-xs font-mono font-bold ${d.color} block leading-none`}>{d.symbol}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/50 block mt-0.5">{d.label}</span>
                  </div>
                  <code className="text-[10px] font-mono text-muted-foreground/70 truncate flex-1 min-w-0">{d.address}</code>
                  <button
                    onClick={() => copyDonateAddr(d.address)}
                    className={`shrink-0 transition-all ${copiedDonate === d.address ? "text-green-400 scale-110" : `${d.color} opacity-60 hover:opacity-100`}`}
                    title={`Copy ${d.symbol} address`}
                  >
                    {copiedDonate === d.address
                      ? <Check className="w-3.5 h-3.5" />
                      : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "BALANCE", value: wallet?.balance ?? "0", sub: `$${(wallet?.balanceUsd ?? 0).toLocaleString()}`, subClass: "text-green-400" },
          {
            label: "TRANSACTIONS",
            value: allTxs.length > 0
              ? `${allTxs.length.toLocaleString()}${page.current.hasMore ? "+" : ""}`
              : (wallet?.transactionCount ?? 0).toLocaleString(),
            sub: null,
          },
          { label: "FIRST SEEN", value: wallet?.firstSeen ? new Date(wallet.firstSeen).toLocaleDateString() : "UNKNOWN", sub: null },
          { label: "LAST ACTIVE", value: wallet?.lastSeen ? new Date(wallet.lastSeen).toLocaleDateString() : "UNKNOWN", sub: null },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/40 border-border/40">
            <CardContent className="p-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">{stat.label}</div>
              {walletLoading ? (
                <div className="h-7 bg-muted/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-xl font-mono text-foreground truncate">{stat.value}</div>
                  {stat.sub && <div className={`text-xs font-mono mt-0.5 ${stat.subClass ?? "text-muted-foreground"}`}>{stat.sub}</div>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Transaction Ledger ── */}
      <Card className="bg-card/40 border-border/40">
        <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-foreground">Transaction Ledger</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {allTxs.length} loaded{page.current.hasMore ? ` · more available` : " · complete"}
                <span className="ml-2 text-muted-foreground/40">· max 25,000 for performance — Load More available</span>
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* ── Minimum Amount Filter ── */}
              <div className="flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded px-2 py-1">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  Min Amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={minAmountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setMinAmountInput(raw);
                    const parsed = parseFloat(raw);
                    if (!isNaN(parsed) && parsed >= 0) setMinAmount(parsed);
                    else if (raw === "" || raw === "0") setMinAmount(0);
                  }}
                  className="w-16 bg-transparent text-xs font-mono text-foreground outline-none text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="1"
                />
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">{chain}</span>
              </div>

              {/* ── View Mode Segmented Control — always visible ── */}
              <div className="flex items-center rounded border border-border/40 overflow-hidden text-[10px] font-mono">
                {(["in-first", "out-first", "mixed"] as const).map((m) => {
                  const labels: Record<string, string> = { "in-first": "IN FIRST", "out-first": "OUT FIRST", mixed: "MIXED" };
                  const colors: Record<string, string> = {
                    "in-first": viewMode === m ? "bg-green-950/60 text-green-400" : "bg-muted/10 text-muted-foreground hover:text-green-400",
                    "out-first": viewMode === m ? "bg-red-950/60 text-red-400" : "bg-muted/10 text-muted-foreground hover:text-red-400",
                    mixed: viewMode === m ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground hover:text-primary",
                  };
                  return (
                    <button
                      key={m}
                      onClick={() => setAndSaveViewMode(m)}
                      className={`px-2.5 py-1.5 transition-colors border-r last:border-r-0 border-border/40 ${colors[m]}`}
                    >
                      {labels[m]}
                    </button>
                  );
                })}
              </div>

              {/* ── Only IN / Only OUT filter — only when Group By Counterparty is ON ── */}
              {groupByCounterparty && (
                <div className="flex items-center rounded border border-border/40 overflow-hidden text-[10px] font-mono">
                  {(["all", "only-in", "only-out"] as const).map((f) => {
                    const labels: Record<string, string> = { all: "ALL", "only-in": "↓ ONLY IN", "only-out": "↑ ONLY OUT" };
                    const colors: Record<string, string> = {
                      all: dirFilter === f ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground hover:text-primary",
                      "only-in": dirFilter === f ? "bg-green-950/60 text-green-400 font-semibold" : "bg-muted/10 text-muted-foreground hover:text-green-400",
                      "only-out": dirFilter === f ? "bg-red-950/60 text-red-400 font-semibold" : "bg-muted/10 text-muted-foreground hover:text-red-400",
                    };
                    return (
                      <button
                        key={f}
                        onClick={() => setDirFilter(f)}
                        className={`px-2.5 py-1.5 transition-colors border-r last:border-r-0 border-border/40 ${colors[f]}`}
                      >
                        {labels[f]}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setGroupByCounterparty((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
                  groupByCounterparty
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-muted/20 text-muted-foreground border-border/40 hover:border-primary/30 hover:text-primary"
                }`}
              >
                <Users className="w-3 h-3" />
                GROUP BY COUNTERPARTY
              </button>
              <div className="text-right">
                <div className="text-xs font-mono text-muted-foreground">
                  {txLoading ? "LOADING..." : groupByCounterparty
                    ? `${groupedRows.length} COUNTERPARTY ROWS`
                    : `${filteredTxs.length} TXS`}
                </div>
                <div className="flex gap-3 mt-0.5 text-xs font-mono justify-end">
                  <span className="text-green-400">↓ {inCount} IN</span>
                  <span className="text-red-400">↑ {outCount} OUT</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Group sort controls — only visible when Group By Counterparty is ON ── */}
          {groupByCounterparty && (
            <div className="flex items-center gap-2.5 pt-3 mt-1 border-t border-border/30 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">Sort Counterparties:</span>
              <div className="flex items-center rounded border border-border/40 overflow-hidden text-[10px] font-mono flex-wrap">
                {(["most-txs", "highest-value", "recent", "exchange-first"] as const).map((key) => {
                  const label = {
                    "most-txs":       "⬆ MOST TXS",
                    "highest-value":  "💰 HIGHEST VALUE",
                    "recent":         "🕐 RECENT",
                    "exchange-first": "🏦 EXCHANGES FIRST",
                  }[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setGroupSort(key)}
                      className={`px-3 py-1.5 border-r last:border-r-0 border-border/40 transition-colors whitespace-nowrap ${
                        groupSort === key
                          ? key === "exchange-first"
                            ? "bg-blue-900/40 text-blue-300 font-semibold"
                            : "bg-primary/20 text-primary font-semibold"
                          : "bg-muted/10 text-muted-foreground hover:text-primary hover:bg-muted/20"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/50 hidden sm:inline">
                + {viewMode === "in-first" ? "IN first" : viewMode === "out-first" ? "OUT first" : "mixed order"}
              </span>
            </div>
          )}
        </CardHeader>

        <div className="overflow-x-auto">
          {groupByCounterparty ? (
            /* ── GROUPED BY (address + direction) VIEW ── */
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-mono text-muted-foreground bg-muted/10">
                  <th className="px-5 py-3 font-normal w-20">DIR</th>
                  <th className="px-5 py-3 font-normal">COUNTERPARTY</th>
                  <th className="px-5 py-3 font-normal">LABEL</th>
                  <th className="px-5 py-3 font-normal text-center">TXS</th>
                  <th className="px-5 py-3 font-normal text-right">TOTAL AMOUNT</th>
                  <th className="px-5 py-3 font-normal text-right">ASSET</th>
                  <th className="px-5 py-3 font-normal text-right">LAST SEEN</th>
                  <th className="px-5 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {txLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="px-5 py-3"><div className="h-5 bg-muted/40 rounded animate-pulse" /></td></tr>
                  ))
                ) : groupedRows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground font-mono text-sm">
                    {allTxs.length > 0
                      ? `ALL ${allTxs.length} TXS BELOW MIN AMOUNT (${minAmount} ${chain.toUpperCase()})`
                      : xlmMessage
                        ? <span className="flex flex-col items-center gap-2">
                            <span>NO TRANSACTIONS FOUND</span>
                            <span className="text-xs text-muted-foreground/70 font-mono normal-case">{xlmMessage}</span>
                            {xlmHistoryLink && <a href={xlmHistoryLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors">View full history on stellar.expert ↗</a>}
                          </span>
                        : "NO TRANSACTIONS FOUND"
                    }
                  </td></tr>
                ) : (
                  groupedRows.map((row, idx) => {
                    const known = KNOWN_LABELS[row.address];
                    const saved = savedWallets.has(row.address);
                    const isSelected = selectedWallets.has(row.address);
                    return (
                      <tr key={`${row.address}:${row.direction}:${idx}`} className={`hover:bg-muted/10 transition-colors text-sm font-mono ${isSelected ? "bg-yellow-950/25 border-l-2 border-yellow-500/50" : known ? "bg-muted/5" : ""}`}>
                        <td className="px-5 py-3">
                          {row.direction === "in" ? (
                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs"><ArrowDownLeft className="w-3 h-3" /> IN</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs"><ArrowUpRight className="w-3 h-3" /> OUT</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveMenu({ addr: row.address, x: rect.left, y: rect.bottom + 4 });
                              }}
                              className="text-primary/80 hover:text-primary text-xs hover:underline font-mono"
                            >
                              {row.address.length > 16 ? `${row.address.slice(0, 10)}…${row.address.slice(-4)}` : row.address}
                            </button>
                            {saved && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                            <a
                              href={WALLET_EXPLORER_MAP[chain]?.(row.address) ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {known ? getKnownBadge(known, "lg") : <span className="text-muted-foreground/30 text-xs font-mono">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center text-muted-foreground">{row.txCount}</td>
                        <td className={`px-5 py-3 text-right text-xs ${row.direction === "in" ? "text-green-400" : "text-red-400"}`}>
                          {row.direction === "in" ? "+" : "−"}{row.totalValue.toFixed(4)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">{row.asset}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                          {row.latestTs ? new Date(row.latestTs).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSavedWallet(row.address); }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                savedWallets.has(row.address)
                                  ? "text-yellow-300 border-yellow-400/60 bg-yellow-950/30 hover:bg-yellow-950/50"
                                  : "text-yellow-600 border-yellow-600/40 bg-yellow-950/10 hover:text-yellow-300 hover:border-yellow-400/60 hover:bg-yellow-950/30"
                              }`}
                              title={savedWallets.has(row.address) ? "Remove from Watchlist" : "Save to Watchlist"}
                            >
                              <Star className={`w-3 h-3 ${savedWallets.has(row.address) ? "fill-yellow-300 text-yellow-300" : "text-yellow-600"}`} />
                              {savedWallets.has(row.address) ? "SAVED" : "WATCHLIST"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleTracked(row.address); }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                multiWallets.includes(row.address)
                                  ? "text-sky-400 border-sky-500/40 bg-sky-950/20 hover:bg-sky-950/40"
                                  : "text-muted-foreground border-border/30 hover:text-sky-400 hover:border-sky-500/40"
                              }`}
                              title={multiWallets.includes(row.address) ? "Remove from Multi-Wallet Analysis" : "Add to Multi-Wallet Analysis"}
                            >
                              {multiWallets.includes(row.address)
                                ? <><BookmarkCheck className="w-3 h-3" /> TRACKED</>
                                : <><Bookmark className="w-3 h-3" /> TRACK</>}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSelected(row.address); }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                selectedWallets.has(row.address)
                                  ? "text-orange-300 border-orange-500/50 bg-orange-950/40 hover:bg-orange-950/60"
                                  : "text-muted-foreground border-border/30 hover:text-orange-300 hover:border-orange-500/40"
                              }`}
                              title={selectedWallets.has(row.address) ? "Deselect wallet" : "Select for report"}
                            >
                              <Flag className={`w-3 h-3 ${selectedWallets.has(row.address) ? "fill-orange-400 text-orange-400" : ""}`} />
                              {selectedWallets.has(row.address) ? "SELECTED" : "SELECT"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); addToCommingle(row.address); }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                commingleWallets.includes(row.address)
                                  ? "text-purple-400 border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/40"
                                  : "text-muted-foreground border-border/30 hover:text-purple-400 hover:border-purple-500/40"
                              }`}
                              title={commingleWallets.includes(row.address) ? "In Commingle Check" : "Add to Commingle Check"}
                            >
                              <GitMerge className={`w-3 h-3 ${commingleWallets.includes(row.address) ? "text-purple-400" : ""}`} />
                              {commingleWallets.includes(row.address) ? "COMMINGLED" : "+ COMMINGLE"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); continueTrailOnWallet(row.address); }}
                              className="text-[10px] font-mono text-primary/60 hover:text-primary border border-primary/15 hover:border-primary/40 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
                              title="Continue trail trace on this wallet"
                            >
                              ▶
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ── INDIVIDUAL TX VIEW ── */
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-mono text-muted-foreground bg-muted/10">
                  <th className="px-5 py-3 font-normal w-20">DIR</th>
                  <th className="px-5 py-3 font-normal">TX HASH</th>
                  <th className="px-5 py-3 font-normal">TIMESTAMP</th>
                  <th className="px-5 py-3 font-normal">COUNTERPARTY</th>
                  <th className="px-5 py-3 font-normal text-right">AMOUNT</th>
                  <th className="px-5 py-3 font-normal text-right">ASSET</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {txLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="h-5 bg-muted/40 rounded animate-pulse" /></td></tr>
                  ))
                ) : filteredTxs.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground font-mono text-sm">
                    {allTxs.length > 0
                      ? `ALL ${allTxs.length} TXS BELOW MIN AMOUNT (${minAmount} ${chain.toUpperCase()})`
                      : xlmMessage
                        ? <span className="flex flex-col items-center gap-2">
                            <span>NO TRANSACTIONS FOUND</span>
                            <span className="text-xs text-muted-foreground/70 font-mono normal-case">{xlmMessage}</span>
                            {xlmHistoryLink && <a href={xlmHistoryLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors">View full history on stellar.expert ↗</a>}
                          </span>
                        : "NO TRANSACTIONS FOUND"
                    }
                  </td></tr>
                ) : (
                  filteredTxs.map((tx, idx) => {
                    const counterparty = tx.direction === "in" ? tx.from : tx.to;
                    const isIn = tx.direction === "in";
                    const isOut = tx.direction === "out";
                    const val = parseFloat(tx.value);
                    return (
                      <tr key={tx.hash || idx} className="hover:bg-muted/10 transition-colors text-sm font-mono">
                        <td className="px-5 py-3">
                          {isIn ? (
                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs font-bold">
                              <ArrowDownLeft className="w-3 h-3" /> IN
                            </span>
                          ) : isOut ? (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs font-bold">
                              <ArrowUpRight className="w-3 h-3" /> OUT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded text-xs">
                              <ArrowLeftRight className="w-3 h-3" /> SELF
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {tx.hash ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-primary/80 text-xs">
                                {tx.hash.length > 12 ? `${tx.hash.slice(0, 8)}…${tx.hash.slice(-4)}` : tx.hash}
                              </span>
                              {explorerTxUrl && (
                                <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                          {tx.destinationTag != null && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-cyan-200 bg-cyan-900/70 border border-cyan-400/50 px-2 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                                🏷 TAG {tx.destinationTag}
                              </span>
                            </div>
                          )}
                          {tx.memo && (
                            <div className="flex items-center gap-1 mt-1 max-w-[200px]">
                              <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-200 bg-amber-900/60 border border-amber-400/40 px-2 py-0.5 rounded-md shadow-sm truncate w-full" title={tx.memo}>
                                <MessageSquare className="w-3 h-3 shrink-0 text-amber-300" />
                                {tx.memo}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleString(undefined, {
                            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                          }) : "—"}
                        </td>
                        <td className="px-5 py-3">{renderCounterpartyCell(counterparty ?? null, tx.direction)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className={val > 0 ? isIn ? "text-green-400" : isOut ? "text-red-400" : "text-foreground" : "text-muted-foreground"}>
                            {isIn ? "+" : isOut ? "−" : ""}{tx.value}
                          </div>
                          {tx.valueUsd > 0 && <div className="text-xs text-muted-foreground mt-0.5">${tx.valueUsd.toLocaleString()}</div>}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">
                          {tx.tokenSymbol || chain.toUpperCase()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Load More / Load All ── */}
        {page.current.error && !txLoading && (
          <div className="px-5 py-3 border-t border-border/40 bg-red-950/10 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono text-red-400">{page.current.error}</span>
              <span className="text-xs font-mono text-muted-foreground ml-2">— cursor preserved, click to retry</span>
            </div>
            <button
              onClick={() => { page.current.error = null; setAllTxs([...page.current.txs]); }}
              className="text-muted-foreground/40 hover:text-muted-foreground shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {page.current.hasMore && !txLoading && (
          <div className="px-5 py-4 border-t border-border/40 bg-muted/5">
            {allTxs.length >= 20000 && (
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-mono text-yellow-400">
                <AlertTriangle className="w-3 h-3" />
                {allTxs.length.toLocaleString()} transactions loaded — loading more may slow your browser.
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-mono text-muted-foreground">
                  {allTxs.length.toLocaleString()} loaded · more available
                </span>
                {page.current.status && (
                  <span className="text-[10px] font-mono text-primary/70">{page.current.status}</span>
                )}
                {page.current.cursor && !page.current.busy && (
                  <span className="text-[10px] font-mono text-muted-foreground/40 break-all">
                    CURSOR: {page.current.cursor.length > 20
                      ? `${page.current.cursor.slice(0, 20)}…${page.current.cursor.slice(-8)}`
                      : page.current.cursor}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  disabled={page.current.busy}
                  onClick={loadMore}
                >
                  {page.current.busy
                    ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> LOADING…</>
                    : loadMoreLabel}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10"
                  disabled={page.current.busy}
                  onClick={loadAll}
                >
                  {page.current.busy
                    ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> LOADING…</>
                    : "LOAD ALL (UP TO 25K)"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {!page.current.hasMore && allTxs.length > 0 && !txLoading && (
          <div className="px-5 py-3 border-t border-border/40 text-center text-xs font-mono text-muted-foreground/60">
            FULL HISTORY LOADED · {allTxs.length.toLocaleString()} TRANSACTIONS
          </div>
        )}
      </Card>

      {/* ── Trail Trace Panel ── */}
      {showTrailPanel && (
        <Card ref={trailPanelRef} className="bg-card/40 border-border/40 border-primary/20">
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary">
                  Trail Trace // Active
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground">
                  MAX DEPTH 5 · {trailEntries.length} NODES
                </span>
                {comminglingAddresses.size > 0 && (
                  <span className="flex items-center gap-1 text-xs font-mono text-yellow-400 bg-yellow-950/40 border border-yellow-500/20 px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" />
                    {comminglingAddresses.size} COMMINGLING DETECTED
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const rpt = generateTrailReport();
                  const title = `Trail Trace Report — ${chain.toUpperCase()} — ${address.slice(0, 12)}`;
                  setReportContent(rpt);
                  setReportTitle(title);
                  setReportJsonData({ reportType: "trail", generatedAt: new Date().toISOString(), chain, subjectAddress: address, trailEntries, comminglingAddresses: [...comminglingAddresses], reportText: rpt });
                  setShowReportModal(true);
                }}
                className="flex items-center gap-1 text-[11px] font-mono text-orange-400 hover:text-orange-300 bg-orange-950/30 hover:bg-orange-950/60 border border-orange-500/30 rounded px-2 py-1 transition-colors"
              >
                <FileText className="w-3 h-3" /> TRAIL REPORT
              </button>
              <button onClick={() => setShowTrailPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Target</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Exchange</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Commingling</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Standard Wallet</span>
            </div>
          </CardHeader>

          {/* ── Analysis Sections ─────────────────────────────────────── */}
          {intersectionData && !trailEntries[0]?.isLoading && trailEntries.length > 1 && (
            <div className="divide-y divide-border/20 border-b border-border/30">

              {/* ── § 1 Direct Intersections ──────────────────────────────── */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-green-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-green-400 font-bold tracking-widest uppercase">
                    § 1 — Direct Intersections
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {intersectionData.directIntersections.length > 0
                      ? `${intersectionData.directIntersections.length} wallet${intersectionData.directIntersections.length > 1 ? "s" : ""} found in both trail + tx history`
                      : "none found"}
                  </span>
                  {intersectionData.totalTxsLoaded === 0 && (
                    <span className="text-[10px] font-mono text-yellow-400 bg-yellow-950/30 px-1.5 py-0.5 rounded border border-yellow-500/20">
                      load transactions first
                    </span>
                  )}
                </div>
                {intersectionData.directIntersections.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    A direct intersection means a wallet appears in both this address's transaction history AND the connection graph.
                    Expand more trail nodes and load more transactions to surface them.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {intersectionData.directIntersections.map((d, i) => (
                      <div key={d.address} className="bg-green-950/20 border border-green-500/20 rounded p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-[10px] font-mono bg-green-900/60 text-green-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: d.address, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {d.address.length > 16 ? `${d.address.slice(0, 8)}…${d.address.slice(-6)}` : d.address}
                          </button>
                          {d.knownInfo && getKnownBadge(d.knownInfo)}
                          {savedWallets.has(d.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">TRAIL DEPTH {d.depth}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-[10px] font-mono pl-1">
                          <div><span className="text-muted-foreground">TXS </span><span className="text-green-300 font-bold">{d.cp.txCount}</span></div>
                          <div><span className="text-muted-foreground">TOTAL </span><span className="text-foreground font-bold">{d.cp.totalValue.toFixed(4)} {chain.toUpperCase()}</span></div>
                          <div><span className="text-muted-foreground">FIRST </span><span className="text-foreground">{d.cp.firstTs.slice(0, 10)}</span></div>
                          <div><span className="text-muted-foreground">LAST </span><span className="text-foreground">{d.cp.lastTs.slice(0, 10)}</span></div>
                        </div>
                        {d.cp.sampleHash && (
                          <div className="text-[10px] font-mono text-muted-foreground/60 mt-1.5 flex items-center gap-1.5 flex-wrap pl-1">
                            <span>SAMPLE TX:</span>
                            <span className="text-primary/60">{d.cp.sampleHash.slice(0, 16)}…</span>
                            {explorerTxUrl && (
                              <a href={explorerTxUrl(d.cp.sampleHash)} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors">
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            <span className="text-muted-foreground/40">{d.cp.sampleDate.slice(0, 16).replace("T", " ")} UTC</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── § 2 Common Endpoints ──────────────────────────────────── */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-orange-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-orange-400 font-bold tracking-widest uppercase">
                    § 2 — Common Endpoints
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {intersectionData.commonEndpoints.length > 0
                      ? `${intersectionData.commonEndpoints.length} wallet${intersectionData.commonEndpoints.length > 1 ? "s" : ""} reachable via multiple paths — potential commingling`
                      : "none detected"}
                  </span>
                </div>
                {intersectionData.commonEndpoints.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    Expand more trail nodes to detect wallets reachable from multiple independent paths — a classic indicator of fund commingling or round-tripping.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {intersectionData.commonEndpoints.map((ep, i) => (
                      <div key={ep.address} className="bg-orange-950/20 border border-orange-500/30 rounded p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-[10px] font-mono bg-orange-900/60 text-orange-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: ep.address, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {ep.address.length > 16 ? `${ep.address.slice(0, 8)}…${ep.address.slice(-6)}` : ep.address}
                          </button>
                          {ep.trailEntry?.knownInfo && getKnownBadge(ep.trailEntry.knownInfo)}
                          <span className="text-[10px] font-mono text-orange-400 font-bold ml-auto shrink-0">{ep.parents.length} PATHS CONVERGE</span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground pl-1 flex flex-wrap gap-1 items-center">
                          <span className="text-muted-foreground/50">VIA:</span>
                          {ep.parents.map((p, pi) => (
                            <span key={p} className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: p, x: r.left, y: r.bottom + 4 }); }}
                                className="text-primary/60 hover:text-primary hover:underline font-mono transition-colors"
                              >
                                {p.length > 12 ? `${p.slice(0, 6)}…${p.slice(-4)}` : p}
                              </button>
                              {pi < ep.parents.length - 1 && <span className="text-muted-foreground/30">·</span>}
                            </span>
                          ))}
                        </div>
                        {ep.cpData && (
                          <div className="grid grid-cols-2 gap-x-6 text-[10px] font-mono mt-1.5 pl-1">
                            <div><span className="text-muted-foreground">TXS </span><span className="text-foreground">{ep.cpData.txCount}</span></div>
                            <div><span className="text-muted-foreground">TOTAL </span><span className="text-foreground">{ep.cpData.totalValue.toFixed(4)} {chain.toUpperCase()}</span></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── § 3 Numbered Trail Paths ──────────────────────────────── */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-primary rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-primary font-bold tracking-widest uppercase">
                    § 3 — Trail Paths
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {intersectionData.paths.length} path{intersectionData.paths.length !== 1 ? "s" : ""} · ⚡ intersection · ⚠ commingling
                  </span>
                </div>
                <div className="space-y-1.5">
                  {intersectionData.paths.map((path, pi) => (
                    <div key={pi} className="flex items-start gap-2 flex-wrap text-[10px] font-mono">
                      <span className="text-muted-foreground/40 shrink-0 w-5 text-right mt-0.5">#{pi + 1}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {path.map((addr, ai) => {
                          const isInt = intersectionData.intersectionAddrs.has(addr);
                          const isComEP = intersectionData.commonEndpoints.some((c) => c.address === addr);
                          const isRoot = ai === 0;
                          const known = KNOWN_LABELS[addr];
                          const short = addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
                          return (
                            <span key={addr + ai} className="flex items-center gap-1">
                              {ai > 0 && <span className="text-muted-foreground/25">→</span>}
                              <button
                                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr, x: r.left, y: r.bottom + 4 }); }}
                                className={`px-1.5 py-0.5 rounded border transition-colors ${
                                  isRoot
                                    ? "bg-primary/20 text-primary border-primary/30"
                                    : isInt
                                    ? "bg-green-950/60 text-green-300 border-green-500/40 font-bold"
                                    : isComEP
                                    ? "bg-orange-950/60 text-orange-300 border-orange-500/40"
                                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/30"
                                }`}
                              >
                                {isInt && <span className="mr-0.5">⚡</span>}
                                {isComEP && !isInt && <span className="mr-0.5">⚠</span>}
                                {known ? known.label : short}
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── § 4 Full Connection Tree (collapsible) ────────────────────── */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowNodeTree((v) => !v); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-[10px] font-mono text-muted-foreground hover:text-foreground border-b border-border/20 hover:bg-muted/10 transition-colors"
          >
            {showNodeTree ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            <span className="uppercase tracking-wider">§ 4 — Full Connection Tree</span>
            <span className="text-muted-foreground/40">{trailEntries.length} nodes · click to {showNodeTree ? "collapse" : "expand"}</span>
          </button>
          {showNodeTree && (
            <div className="p-4 space-y-1 max-h-[420px] overflow-y-auto">
              {trailEntries.map((entry) => {
                const isCommingling = comminglingAddresses.has(entry.address);
                const isExchange = entry.knownInfo?.type === "exchange" || entry.knownInfo?.type === "bridge";
                const isGenesis = entry.knownInfo?.type === "genesis";
                const isDagTeam = entry.knownInfo?.type === "dag-team";
                const isRoot = entry.depth === 0;

                let dotColor = "bg-muted-foreground";
                if (isRoot) dotColor = "bg-primary";
                else if (isExchange) dotColor = "bg-blue-500";
                else if (isDagTeam) dotColor = "bg-orange-500";
                else if (isGenesis) dotColor = "bg-purple-500";
                else if (isCommingling) dotColor = "bg-yellow-500";
                else if (intersectionData?.intersectionAddrs.has(entry.address)) dotColor = "bg-green-500";

                let rowBg = "hover:bg-muted/10";
                if (isCommingling) rowBg = "bg-yellow-950/20 hover:bg-yellow-950/30 border-l-2 border-yellow-500/40";
                else if (intersectionData?.intersectionAddrs.has(entry.address)) rowBg = "bg-green-950/20 hover:bg-green-950/30 border-l-2 border-green-500/40";
                else if (isExchange) rowBg = "bg-blue-950/10 hover:bg-blue-950/20";
                else if (isDagTeam) rowBg = "bg-orange-950/10 hover:bg-orange-950/20 border-l-2 border-orange-500/30";
                else if (isRoot) rowBg = "bg-primary/5 border-l-2 border-primary/40";

                return (
                  <div
                    key={`${entry.address}-${entry.depth}-${entry.parentAddress}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-colors ${rowBg}`}
                    style={{ paddingLeft: `${12 + entry.depth * 20}px` }}
                  >
                    {entry.depth > 0 && (
                      <span className="text-border/60 shrink-0">{"└─"}</span>
                    )}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${entry.isLoading ? "animate-pulse" : ""}`} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setActiveMenu({ addr: entry.address, x: rect.left, y: rect.bottom + 4 });
                      }}
                      className="text-primary/80 hover:text-primary hover:underline transition-colors truncate max-w-[200px]"
                    >
                      {entry.address.length > 20 ? `${entry.address.slice(0, 10)}…${entry.address.slice(-6)}` : entry.address}
                    </button>
                    {entry.knownInfo && getKnownBadge(entry.knownInfo)}
                    {savedWallets.has(entry.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                    {intersectionData?.intersectionAddrs.has(entry.address) && (
                      <span className="flex items-center gap-1 text-green-400 bg-green-950/40 px-1.5 py-0.5 rounded border border-green-500/20 text-[10px]">
                        ⚡ INTERSECTION
                      </span>
                    )}
                    {isCommingling && !intersectionData?.intersectionAddrs.has(entry.address) && (
                      <span className="flex items-center gap-1 text-yellow-400 bg-yellow-950/40 px-1.5 py-0.5 rounded border border-yellow-500/20 text-[10px]">
                        <AlertTriangle className="w-2.5 h-2.5" /> COMMINGLING
                      </span>
                    )}
                    <span className="text-muted-foreground/60 shrink-0">D{entry.depth}</span>
                    {entry.totalValueUsd > 0 && (
                      <span className="text-muted-foreground shrink-0">${entry.totalValueUsd.toFixed(0)}</span>
                    )}
                    {entry.txCount > 0 && (
                      <span className="text-muted-foreground/60 shrink-0">{entry.txCount} tx</span>
                    )}
                    {entry.error && <span className="text-red-400 text-[10px]">FETCH FAILED</span>}
                    {entry.isLoading && <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />}
                    {!entry.isLoading && !entry.isExpanded && !entry.error && entry.depth < 5 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); expandTrailNode(entry); }}
                        className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-1.5 py-0.5 rounded transition-colors"
                      >
                        <ChevronRight className="w-2.5 h-2.5" /> EXPAND
                      </button>
                    )}
                    {entry.isExpanded && entry.childAddresses.length > 0 && (
                      <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <ChevronDown className="w-2.5 h-2.5" /> {entry.childAddresses.length} peers
                      </span>
                    )}
                    {entry.isExpanded && entry.childAddresses.length === 0 && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">NO CONNECTIONS</span>
                    )}
                    {entry.depth >= 5 && (
                      <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground/40">
                        <Zap className="w-2.5 h-2.5" /> MAX DEPTH
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      {/* ── Origin Trace Panel ── */}
      {showOriginPanel && (
        <Card ref={originPanelRef} className="bg-card/40 border-border/40 border-cyan-500/20 shadow-lg shadow-cyan-500/5">
          {/* Header */}
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full bg-cyan-400 ${originLoading ? "animate-pulse" : ""}`} />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-cyan-300">
                  Trace to Origin
                </CardTitle>
                {originHops.length > 1 && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {originHops.length - 1} hop{originHops.length !== 2 ? "s" : ""}{!originLoading && " · complete"}
                  </span>
                )}
              </div>
              <button onClick={() => setShowOriginPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1.5 leading-relaxed">
              Follows the highest-value incoming transaction at each hop backwards to uncover the original source of funds.
            </p>
          </CardHeader>

          {/* Mode selector — shown before trace starts */}
          {originHops.length === 0 && !originLoading && (
            <div className="p-5 space-y-4">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Select Trace Mode</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOriginMode("standard")}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    originMode === "standard"
                      ? "border-cyan-500/50 bg-cyan-950/30 text-cyan-300"
                      : "border-border/40 bg-muted/10 text-muted-foreground hover:border-cyan-500/30 hover:text-cyan-400"
                  }`}
                >
                  <div className="text-xs font-mono font-bold mb-1">STANDARD</div>
                  <div className="text-[10px] font-mono opacity-80">Up to 30 hops · ~5–15 sec</div>
                </button>
                <button
                  onClick={() => setOriginMode("deep")}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    originMode === "deep"
                      ? "border-orange-500/50 bg-orange-950/30 text-orange-300"
                      : "border-border/40 bg-muted/10 text-muted-foreground hover:border-orange-500/30 hover:text-orange-400"
                  }`}
                >
                  <div className="text-xs font-mono font-bold mb-1 flex items-center gap-1.5">
                    DEEP ORIGIN TRACE
                    {originMode === "deep" && <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">Up to 75 hops</div>
                  <div className="text-[10px] font-mono text-orange-400/80">⚠ May take 20–60 sec · more resources</div>
                </button>
              </div>
              <button
                onClick={() => void startOriginTrace()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white font-mono text-xs font-bold tracking-widest transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> START ORIGIN TRACE
              </button>
            </div>
          )}

          {/* Status bar — shown while loading */}
          {originLoading && (
            <div className="px-5 py-2.5 flex items-center gap-3 border-b border-border/30 bg-cyan-950/10">
              <Loader2 className="w-3 h-3 text-cyan-400 animate-spin shrink-0" />
              <span className="text-[11px] font-mono text-cyan-300/80 flex-1 truncate">{originStatus}</span>
              <button
                onClick={() => { originAbortRef.current = true; }}
                className="text-[10px] font-mono text-muted-foreground hover:text-red-400 border border-border/30 hover:border-red-500/40 px-2 py-0.5 rounded transition-colors shrink-0"
              >
                STOP
              </button>
            </div>
          )}

          {/* Hop list */}
          {originHops.length > 0 && (
            <div className="divide-y divide-border/20">
              {originHops.map((hop) => {
                const isRoot     = hop.hop === 0;
                const isExchange = hop.stopReason === "exchange";
                const isDeadEnd  = hop.stopReason === "dead-end";
                const isLoop     = hop.stopReason === "loop";
                const isMaxHops  = hop.stopReason === "max-hops";
                const fmtTs = (ts: string) => {
                  if (!ts) return "";
                  const d = new Date(ts);
                  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                };
                const shortA = (a: string) => a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-4)}` : a;
                let rowBg = "hover:bg-muted/5";
                if (isRoot)     rowBg = "bg-cyan-950/10";
                if (isExchange) rowBg = "bg-blue-950/20 border-l-2 border-blue-400/50";
                if (isDeadEnd)  rowBg = "bg-yellow-950/10 border-l-2 border-yellow-500/20";
                if (isLoop)     rowBg = "bg-orange-950/10 border-l-2 border-orange-500/20";
                return (
                  <div key={hop.hop} className={`px-5 py-3 transition-colors ${rowBg}`}>
                    {/* Main row */}
                    <div className="flex items-start gap-2.5 flex-wrap">
                      {/* Hop number */}
                      <span className="text-[10px] font-mono text-muted-foreground/40 w-11 shrink-0 pt-0.5 tabular-nums">
                        {String(hop.hop).padStart(2, "0")}
                      </span>
                      {/* Direction badge */}
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                        isRoot
                          ? "bg-cyan-950/50 text-cyan-300 border-cyan-500/40"
                          : "bg-green-950/40 text-green-400 border-green-500/20"
                      }`}>
                        {isRoot ? "TARGET" : "← IN"}
                      </span>
                      {/* Address + badges + amount + date */}
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        {hop.isLoading ? (
                          <span className="text-[11px] font-mono text-muted-foreground animate-pulse">scanning…</span>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveMenu({ addr: hop.address, x: rect.left, y: rect.bottom + 4 });
                              }}
                              className="text-xs font-mono text-primary/80 hover:text-primary hover:underline transition-colors"
                              title={hop.address}
                            >
                              {shortA(hop.address)}
                            </button>
                            {hop.knownInfo && getKnownBadge(hop.knownInfo)}
                            {savedWallets.has(hop.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                            {WALLET_EXPLORER_MAP[chain] && (
                              <a
                                href={WALLET_EXPLORER_MAP[chain](hop.address)}
                                target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </>
                        )}
                        {!isRoot && hop.txAmount && (
                          <span className="text-green-400 text-xs font-mono font-bold ml-1">
                            +{parseFloat(hop.txAmount).toFixed(4)} {hop.txAsset}
                          </span>
                        )}
                        {!isRoot && hop.txTimestamp && (
                          <span className="text-muted-foreground text-[10px] font-mono">{fmtTs(hop.txTimestamp)}</span>
                        )}
                      </div>
                    </div>

                    {/* TX hash + memo/tag sub-line */}
                    {!isRoot && !hop.isLoading && (hop.txHash || hop.txMemo || hop.txDestinationTag != null) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 pl-[3.5rem] text-[10px] font-mono text-muted-foreground/50">
                        {hop.txHash && (
                          <span className="flex items-center gap-1">
                            TA: {hop.txHash.length > 12 ? `${hop.txHash.slice(0, 10)}…` : hop.txHash}
                            {explorerTxUrl && (
                              <a href={explorerTxUrl(hop.txHash)} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary transition-colors ml-0.5">
                                <ExternalLink className="w-2 h-2" />
                              </a>
                            )}
                          </span>
                        )}
                        {hop.txDestinationTag != null && (
                          <span className="text-cyan-300/60">Destination Tag: {hop.txDestinationTag}</span>
                        )}
                        {hop.txMemo && (
                          <span className="text-amber-300/60">Memo: {hop.txMemo}</span>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {hop.error && (
                      <div className="mt-1.5 pl-[3.5rem] flex items-center gap-1.5 text-[10px] font-mono text-red-400">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {hop.error}
                      </div>
                    )}

                    {/* Stop-reason banners */}
                    {isExchange && (
                      <div className="mt-2 pl-[3.5rem]">
                        <span className="inline-flex items-center gap-2 text-[11px] font-mono text-blue-100 bg-blue-900/50 border border-blue-400/40 px-3 py-1.5 rounded-lg font-bold shadow-sm">
                          🏦 EXCHANGE REACHED — Funds entered the network via a custodial exchange. Origin tracing complete.
                        </span>
                      </div>
                    )}
                    {isDeadEnd && (
                      <div className="mt-2 pl-[3.5rem]">
                        <span className="inline-flex items-center gap-2 text-[11px] font-mono text-yellow-200 bg-yellow-950/40 border border-yellow-500/30 px-3 py-1.5 rounded-lg">
                          ⚠ DEAD END — No incoming transactions found. This may be the original source wallet.
                        </span>
                      </div>
                    )}
                    {isLoop && (
                      <div className="mt-2 pl-[3.5rem]">
                        <span className="inline-flex items-center gap-2 text-[11px] font-mono text-orange-200 bg-orange-950/40 border border-orange-500/30 px-3 py-1.5 rounded-lg">
                          🔄 CIRCULAR — This address already appeared earlier in the chain. Stopping to prevent loop.
                        </span>
                      </div>
                    )}
                    {isMaxHops && (
                      <div className="mt-2 pl-[3.5rem]">
                        <span className="inline-flex items-center gap-2 text-[11px] font-mono text-muted-foreground bg-muted/20 border border-border/40 px-3 py-1.5 rounded-lg">
                          ⏹ MAX DEPTH REACHED ({originMode === "deep" ? "75" : "30"} hops){originMode === "standard" ? " — switch to Deep Origin Trace for deeper analysis" : ""}.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Footer: reconfigure / retrace */}
              {!originLoading && originHops.length > 0 && (
                <div className="px-5 py-3 flex items-center justify-between gap-3 bg-muted/5">
                  <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                    {originHops.length - 1} hop{originHops.length !== 2 ? "s" : ""} · {originMode === "deep" ? "DEEP (75 max)" : "STANDARD (30 max)"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOriginHops([])}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 px-2.5 py-1 rounded transition-colors whitespace-nowrap"
                    >
                      RECONFIGURE
                    </button>
                    <button
                      onClick={() => void startOriginTrace()}
                      disabled={originLoading}
                      className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/60 bg-cyan-950/20 hover:bg-cyan-950/40 px-2.5 py-1 rounded transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      RETRACE
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Multi-Wallet Commingling Analysis Panel ── */}
      {showMultiPanel && (
        <Card ref={multiPanelRef} className="bg-card/40 border-violet-500/30 shadow-lg shadow-violet-500/5">
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-violet-300">
                  Intersection / Funnel Analysis
                </CardTitle>
                {multiResult && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {multiResult.trackedWallets.length} wallets · {multiResult.sharedCounterparties.length + multiResult.commonEndpoints.length} shared nodes
                  </span>
                )}
              </div>
              <button onClick={() => setShowMultiPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1.5 leading-relaxed">
              Deep convergence detection: maps up to depth-4 connections for every tracked wallet and surfaces shared private intermediaries, common funneling hubs, and exchange outflows — private/exchange strictly separated. Click{" "}
              <span className="text-yellow-400 font-bold">TRACK</span>
              {" "}on any counterparty row to add wallets here — or paste addresses manually.
            </p>

            {/* ── Tracked Wallet List ── */}
            <div className="mt-4 space-y-2.5">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Tracked Wallets</div>

              {/* Primary wallet (always included) */}
              {(() => { const c = WALLET_COLORS[0]; return (
                <div className={`flex items-center gap-2.5 ${c.bg} border ${c.border} rounded-lg px-3 py-2`}>
                  <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                  <span className={`text-xs font-mono ${c.text} flex-1 truncate min-w-0`}>{address}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 uppercase">Primary</span>
                  {KNOWN_LABELS[address] && <span className="shrink-0">{getKnownBadge(KNOWN_LABELS[address])}</span>}
                </div>
              ); })()}

              {/* Additional wallets */}
              {multiWallets.map((w, i) => {
                const c = WALLET_COLORS[(i + 1) % WALLET_COLORS.length];
                return (
                  <div key={w} className={`flex items-center gap-2.5 ${c.bg} border ${c.border} rounded-lg px-3 py-2`}>
                    <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                    <span className={`text-xs font-mono ${c.text} flex-1 truncate min-w-0`}>{w}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">Wallet {i + 2}</span>
                    {KNOWN_LABELS[w] && <span className="shrink-0">{getKnownBadge(KNOWN_LABELS[w])}</span>}
                    <button
                      onClick={() => setMultiWallets((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground/60 hover:text-red-400 transition-colors shrink-0 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {/* Add wallet input */}
              {true && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={multiWalletInput}
                    onChange={(e) => setMultiWalletInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && multiWalletInput.trim() && !multiWallets.includes(multiWalletInput.trim())) {
                        setMultiWallets((prev) => [...prev, multiWalletInput.trim()]);
                        setMultiWalletInput("");
                      }
                    }}
                    placeholder="Paste additional wallet address…"
                    className="flex-1 bg-muted/20 border border-border/40 focus:border-violet-500/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
                  />
                  <button
                    onClick={() => {
                      const trimmed = multiWalletInput.trim();
                      if (trimmed && !multiWallets.includes(trimmed)) {
                        setMultiWallets((prev) => [...prev, trimmed]);
                        setMultiWalletInput("");
                      }
                    }}
                    disabled={!multiWalletInput.trim()}
                    className="px-3 py-2 rounded-lg bg-violet-900/60 border border-violet-500/40 text-violet-300 hover:bg-violet-900/80 disabled:opacity-40 transition-colors shrink-0"
                    title="Add wallet"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Analyze button */}
              <button
                onClick={runMultiAnalysis}
                disabled={multiLoading || multiWallets.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:bg-muted/30 disabled:text-muted-foreground/60 text-white font-mono text-xs font-bold tracking-widest transition-colors mt-1"
              >
                {multiLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>ANALYZING…</span>
                    {multiProgress && <span className="opacity-60 truncate max-w-[240px] font-normal">{multiProgress}</span>}
                  </>
                ) : (
                  <><GitMerge className="w-3.5 h-3.5" /> RUN INTERSECTION ANALYSIS</>
                )}
              </button>
              {multiError && (
                <p className="text-xs font-mono text-red-400 flex items-center gap-1.5 mt-0.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {multiError}
                </p>
              )}
            </div>
          </CardHeader>

          {multiResult && (
            <div className="divide-y divide-border/20">

              {/* ── Generate intersection report ── */}
              <div className="px-5 py-3 bg-violet-950/30 border-b border-violet-500/20 flex items-center justify-between gap-3">
                <div className="text-xs font-mono text-violet-300/80">
                  Analysis complete · {multiResult.trackedWallets.length} wallets · {multiResult.sharedCounterparties.length + multiResult.commonEndpoints.length} shared nodes found
                </div>
                <button
                  onClick={() => {
                    const rpt = generateMultiReport();
                    const title = `Intersection / Funnel Analysis — ${chain.toUpperCase()} — ${address.slice(0, 12)}`;
                    setReportContent(rpt);
                    setReportTitle(title);
                    setReportJsonData({ reportType: "multi-intersection", generatedAt: new Date().toISOString(), chain, trackedWallets: multiResult.trackedWallets, reportText: rpt });
                    setShowReportModal(true);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-white bg-violet-600 hover:bg-violet-500 border border-violet-500/50 rounded px-3 py-1.5 transition-colors shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" /> GENERATE INTERSECTION REPORT
                </button>
              </div>

              {/* ── Wallet legend ── */}
              <div className="px-5 py-3 flex items-center gap-4 flex-wrap bg-muted/5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Legend:</span>
                {multiResult.trackedWallets.map((w, i) => {
                  const c = WALLET_COLORS[i % WALLET_COLORS.length];
                  return (
                    <div key={w} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                      <span className={`text-[10px] font-mono ${c.text}`}>
                        {i === 0 ? "PRIMARY" : `W${i + 1}`}: {w.length > 18 ? `${w.slice(0, 10)}…${w.slice(-4)}` : w}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ── § 1 Private Convergence Points  /  § 2 Exchange Flows ── */}
              {(() => {
                const EXCL2   = new Set(["DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"]);
                const isExch2 = (a: string) => ["exchange","bridge","genesis"].includes(KNOWN_LABELS[a]?.type ?? "");
                const seen2   = new Set<string>();
                const allUniq2 = [...multiResult.sharedCounterparties, ...multiResult.commonEndpoints]
                  .filter(s => { if (seen2.has(s.address)) return false; seen2.add(s.address); return !EXCL2.has(s.address); });
                const privNodes = allUniq2.filter(s => !isExch2(s.address));
                return (
                  <>
                    {/* ── § 1 Private Convergence Points ── */}
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="w-1.5 h-4 bg-red-500 rounded-sm shrink-0" />
                        <span className="text-[10px] font-mono text-red-300 font-bold tracking-widest uppercase">§ 1 — Private Convergence Points</span>
                        <span className="text-[10px] font-mono text-muted-foreground">private wallets shared by 2+ tracked wallets</span>
                        <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${privNodes.length > 0 ? "bg-red-950/60 text-red-200 border-red-400/40" : "text-muted-foreground border-border/30"}`}>
                          {privNodes.length} found
                        </span>
                      </div>
                      {privNodes.length === 0 ? (
                        <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                          No private convergence points found within depth-4. Try adding more wallets or loading additional TX history.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {privNodes.map((entry, i) => {
                            const kn     = entry.knownInfo ?? KNOWN_LABELS[entry.address];
                            const isTeam = kn?.type === "dag-team";
                            return (
                              <div key={entry.address} className={`border rounded-lg p-3 ${isTeam ? "bg-blue-950/15 border-blue-500/20" : "bg-red-950/10 border-red-500/20"}`}>
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-bold shrink-0 ${isTeam ? "bg-blue-900/70 text-blue-200 border-blue-400/40" : "bg-red-900/70 text-red-200 border-red-400/40"}`}>
                                    #{i + 1}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: entry.address, x: r.left, y: r.bottom + 4 }); }}
                                    className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                                  >
                                    {entry.address.length > 24 ? `${entry.address.slice(0, 12)}…${entry.address.slice(-6)}` : entry.address}
                                  </button>
                                  {kn && getKnownBadge(kn, "md")}
                                  {isTeam && <span className="text-[10px] font-mono text-blue-400/80 shrink-0">◄ OFFICIAL ENTITY</span>}
                                  {savedWallets.has(entry.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                                  <span className={`ml-auto text-[10px] font-mono font-bold shrink-0 ${entry.appearances.length >= multiResult.trackedWallets.length ? "text-red-300" : "text-orange-300"}`}>
                                    {entry.appearances.length}/{multiResult.trackedWallets.length} wallets
                                  </span>
                                </div>
                                <div className="space-y-1.5 mt-1">
                                  {entry.appearances.map((app) => {
                                    const idx      = multiResult.trackedWallets.indexOf(app.wallet);
                                    const c        = WALLET_COLORS[idx % WALLET_COLORS.length];
                                    const wLabel   = idx === 0 ? "PRIMARY" : `W${idx + 1}`;
                                    const trailStr = app.pathChain.length > 1
                                      ? app.pathChain.map(a => a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a).join(" → ")
                                      : `${app.wallet.length > 14 ? `${app.wallet.slice(0, 6)}…${app.wallet.slice(-4)}` : app.wallet} → ${entry.address.length > 14 ? `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}` : entry.address}`;
                                    return (
                                      <div key={app.wallet} className={`rounded px-2 py-1.5 border ${c.border} ${c.bg} text-[10px] font-mono`}>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <div className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
                                          <span className={`${c.text} font-bold shrink-0`}>{wLabel}</span>
                                          <span className="text-muted-foreground/60">·</span>
                                          <span className="text-foreground font-bold">{app.txCount} tx</span>
                                          <span className={`${app.depth === 1 ? "text-yellow-400/80" : "text-muted-foreground/60"}`}>d{app.depth}</span>
                                          {app.totalValueUsd > 0 && <span className="text-muted-foreground/70">${app.totalValueUsd.toFixed(0)}</span>}
                                        </div>
                                        {app.pathChain.length > 1 && (
                                          <div className="mt-0.5 text-muted-foreground/50 text-[9px] truncate" title={trailStr}>
                                            {trailStr}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </>
                );
              })()}

              {/* ── § 3 Commingling Patterns (private only) ── */}
              {(() => {
                const privPats = multiResult.patterns.filter(p =>
                  !["exchange","bridge","genesis"].includes(KNOWN_LABELS[p.sharedAddr]?.type ?? "") &&
                  p.sharedAddr !== "DAG5KmHp9gFS723uN6uukwRqCTwvrddaW5QuKKKz"
                );
                return (
                <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-red-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-red-300 font-bold tracking-widest uppercase">§ 3 — Commingling Patterns</span>
                  <span className="text-[10px] font-mono text-muted-foreground">private funneling paths to shared nodes</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${privPats.length > 0 ? "bg-red-950/60 text-red-200 border-red-400/40" : "text-muted-foreground border-border/30"}`}>
                    {privPats.length} patterns
                  </span>
                </div>
                {privPats.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3">No private commingling patterns detected.</p>
                ) : (
                  <div className="space-y-3">
                    {privPats.map((pat) => (
                      <div key={pat.sharedAddr} className="bg-red-950/10 border border-red-500/15 rounded-lg p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2.5">
                          <span className="text-[10px] font-mono bg-red-900/70 text-red-200 px-1.5 py-0.5 rounded border border-red-400/40 font-bold shrink-0">
                            PATTERN #{pat.id}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: pat.sharedAddr, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {pat.sharedAddr.length > 20 ? `${pat.sharedAddr.slice(0, 10)}…${pat.sharedAddr.slice(-6)}` : pat.sharedAddr}
                          </button>
                          {pat.knownInfo && getKnownBadge(pat.knownInfo, "md")}
                          <div className="ml-auto flex items-center gap-3 text-[10px] font-mono shrink-0">
                            {pat.totalTxCount > 0 && <span className="text-foreground font-bold">{pat.totalTxCount} tx</span>}
                            {pat.totalValueUsd > 0 && <span className="text-muted-foreground">${pat.totalValueUsd.toFixed(0)}</span>}
                            <span className="text-red-400 font-bold">{pat.paths.length} paths converge</span>
                          </div>
                        </div>
                        <div className="space-y-1.5 pl-2 border-l-2 border-red-500/20">
                          {pat.paths.map((p) => {
                            const idx = multiResult.trackedWallets.indexOf(p.wallet);
                            const c = WALLET_COLORS[idx % WALLET_COLORS.length];
                            return (
                              <div key={p.wallet} className="flex items-center gap-1 flex-wrap text-[10px] font-mono">
                                <span className={`${c.text} font-bold shrink-0`}>{idx === 0 ? "PRIMARY" : `WALLET ${idx + 1}`}</span>
                                {p.path.map((step, si) => (
                                  <span key={si} className="flex items-center gap-1">
                                    {si > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />}
                                    <span className={
                                      si === 0 ? `${c.text}/70` :
                                      si === p.path.length - 1 ? "text-red-300 font-bold" :
                                      "text-muted-foreground"
                                    }>
                                      {step.length > 14 ? `${step.slice(0, 8)}…${step.slice(-4)}` : step}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                );
              })()}

            </div>
          )}
        </Card>
      )}

      {/* ── Commingle Check Panel ── */}
      {showComminglePanel && (
        <Card ref={comminglePanelRef} className="bg-card/40 border-amber-500/30 shadow-lg shadow-amber-500/5">
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full bg-amber-400 ${commingleLoading ? "animate-pulse" : ""}`} />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300">
                  Commingle Check
                </CardTitle>
                {commingleResult && (
                  <span className="text-xs font-mono text-muted-foreground">
                    <span className="text-green-400/80">{commingleResult.findings.filter((f) => f.knownInfo?.type !== "exchange").length} private</span>
                    {" · "}{commingleResult.totalScanned} scanned
                  </span>
                )}
              </div>
              <button onClick={() => setShowComminglePanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1.5 leading-relaxed">
              Scans up to 4 tiers deep from the target and each comparison wallet, then surfaces all shared addresses — direct counterparties, intermediaries, and common endpoints. Generates a police-ready report.
            </p>

            {/* ── Comparison wallet list ── */}
            <div className="mt-4 space-y-2.5">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Target Wallet (fixed)</div>
              <div className="flex items-center gap-2.5 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs font-mono text-amber-300 flex-1 truncate min-w-0">{address}</span>
                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 uppercase">Target</span>
                {KNOWN_LABELS[address] && <span className="shrink-0">{getKnownBadge(KNOWN_LABELS[address])}</span>}
              </div>

              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider pt-1">Comparison Wallets</div>
              {commingleWallets.map((w, i) => (
                <div key={w} className="flex items-center gap-2.5 bg-muted/20 border border-border/40 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/60 shrink-0" />
                  <span className="text-xs font-mono text-foreground flex-1 truncate min-w-0">{w}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">Wallet {i + 1}</span>
                  {KNOWN_LABELS[w] && <span className="shrink-0">{getKnownBadge(KNOWN_LABELS[w])}</span>}
                  <button
                    onClick={() => setCommingleWallets((prev) => { const next = prev.filter((_, j) => j !== i); try { localStorage.setItem("chaintrace-commingle-wallets", JSON.stringify(next)); } catch { /* noop */ } return next; })}
                    className="text-muted-foreground/60 hover:text-red-400 transition-colors shrink-0 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={commingleWalletInput}
                  onChange={(e) => setCommingleWalletInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = commingleWalletInput.trim();
                      if (trimmed && !commingleWallets.includes(trimmed) && trimmed !== address) {
                        setCommingleWallets((prev) => { const next = [...prev, trimmed]; try { localStorage.setItem("chaintrace-commingle-wallets", JSON.stringify(next)); } catch { /* noop */ } return next; });
                        setCommingleWalletInput("");
                      }
                    }
                  }}
                  placeholder="Paste comparison wallet address…"
                  className="flex-1 bg-muted/20 border border-border/40 focus:border-amber-500/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
                />
                <button
                  onClick={() => {
                    const trimmed = commingleWalletInput.trim();
                    if (trimmed && !commingleWallets.includes(trimmed) && trimmed !== address) {
                      setCommingleWallets((prev) => { const next = [...prev, trimmed]; try { localStorage.setItem("chaintrace-commingle-wallets", JSON.stringify(next)); } catch { /* noop */ } return next; });
                      setCommingleWalletInput("");
                    }
                  }}
                  disabled={!commingleWalletInput.trim()}
                  className="px-3 py-2 rounded-lg bg-amber-900/60 border border-amber-500/40 text-amber-300 hover:bg-amber-900/80 disabled:opacity-40 transition-colors shrink-0"
                  title="Add wallet"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={runCommingleCheck}
                disabled={commingleLoading || commingleWallets.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:bg-muted/30 disabled:text-muted-foreground/60 text-white font-mono text-xs font-bold tracking-widest transition-colors mt-1"
              >
                {commingleLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>SCANNING…</span>
                    {commingleProgress && <span className="opacity-60 truncate max-w-[240px] font-normal">{commingleProgress}</span>}
                  </>
                ) : (
                  <><GitMerge className="w-3.5 h-3.5" /> RUN COMMINGLE CHECK (4 TIERS)</>
                )}
              </button>
              {commingleError && (
                <p className="text-xs font-mono text-red-400 flex items-center gap-1.5 mt-0.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {commingleError}
                </p>
              )}
            </div>
          </CardHeader>

          {commingleResult && (
            <div className="divide-y divide-border/20">

              {/* ── Generate report bar ── */}
              <div className="px-5 py-3 bg-amber-950/20 border-b border-amber-500/20 flex flex-col gap-2.5">
                {/* Row 1: scan summary + MIN AMOUNT + GENERATE */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-xs font-mono text-amber-300/80">
                      Scan complete · <span className="text-green-400/80">{commingleResult.findings.filter((f) => f.knownInfo?.type !== "exchange").length} private</span> · {commingleResult.totalScanned} addresses mapped
                    </div>
                    {commingleResult.tieredCounts[0] > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-red-300 bg-red-950/50 border border-red-500/30 px-2 py-0.5 rounded font-bold">
                        <AlertTriangle className="w-2.5 h-2.5" /> {commingleResult.tieredCounts[0]} DIRECT MATCH{commingleResult.tieredCounts[0] !== 1 ? "ES" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {/* Row 2: MIN AMOUNT filter + GENERATE button */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider shrink-0">Min Amount:</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={commingleMinAmountInput}
                    onChange={(e) => {
                      setCommingleMinAmountInput(e.target.value);
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 0) setCommingleMinAmount(v);
                    }}
                    onBlur={() => {
                      const v = parseFloat(commingleMinAmountInput);
                      if (isNaN(v) || v < 0) { setCommingleMinAmountInput("1"); setCommingleMinAmount(1); }
                    }}
                    className="w-20 bg-muted/20 border border-amber-500/30 focus:border-amber-400/60 rounded px-2 py-1 text-xs font-mono text-amber-200 outline-none transition-colors"
                  />
                  <span className="text-[10px] font-mono text-amber-300/60 shrink-0">{(commingleResult?.chain ?? chain).toUpperCase()}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {commingleMinAmount <= 0 ? "showing all transactions" : "dust & fees excluded"}
                  </span>
                  <button
                    className="ml-auto flex items-center gap-1.5 text-[11px] font-mono font-bold text-white bg-amber-600 hover:bg-amber-500 border border-amber-500/50 rounded px-3 py-1.5 transition-colors shrink-0"
                    onClick={() => {
                    const rpt = generateCommingleReport();
                    const title = `Commingle Check Report — ${(commingleResult?.chain ?? chain).toUpperCase()} — ${(commingleResult?.targetWallet ?? address).slice(0, 12)}`;
                    setReportContent(rpt);
                    setReportTitle(title);
                    const enrichedFindings = (commingleResult?.findings ?? []).map((f) => ({
                      ...f,
                      sampleTransactions: allTxs
                        .filter((t) =>
                          (t.direction === "in" ? t.from : t.to) === f.sharedAddress &&
                          (commingleMinAmount <= 0 || parseFloat(t.value) >= commingleMinAmount)
                        )
                        .slice(0, 5)
                        .map((t) => ({
                          hash: t.hash,
                          direction: t.direction,
                          value: t.value,
                          timestamp: t.timestamp,
                          memo: t.memo ?? null,
                          destinationTag: t.destinationTag ?? null,
                        })),
                    }));
                    setReportJsonData({ reportType: "commingle", generatedAt: new Date().toISOString(), ...commingleResult, findings: enrichedFindings, reportText: rpt });
                    setShowReportModal(true);
                  }}
                >
                  <FileText className="w-3.5 h-3.5" /> GENERATE REPORT
                </button>
              </div>
            </div>

              {/* ── Tier badges summary ── */}
              <div className="px-5 py-3 flex items-center gap-4 flex-wrap bg-muted/5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Shared nodes by tier:</span>
                {([
                  { label: "Tier 1 · Direct", count: commingleResult.tieredCounts[0], color: "text-red-300 border-red-500/30 bg-red-950/30" },
                  { label: "Tier 2", count: commingleResult.tieredCounts[1], color: "text-orange-300 border-orange-500/30 bg-orange-950/30" },
                  { label: "Tier 3", count: commingleResult.tieredCounts[2], color: "text-yellow-300 border-yellow-500/30 bg-yellow-950/30" },
                  { label: "Tier 4", count: commingleResult.tieredCounts[3], color: "text-muted-foreground border-border/30 bg-muted/10" },
                ] as const).map((t) => (
                  <div key={t.label} className={`flex items-center gap-1.5 border rounded px-2 py-0.5 text-[10px] font-mono font-bold ${t.color}`}>
                    {t.label}: {t.count}
                  </div>
                ))}
              </div>

              {/* ── § 1 Tier 1 — Direct Shared Counterparties ── */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-red-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-red-300 font-bold tracking-widest uppercase">§ 1 — Tier 1: Direct Shared Counterparties</span>
                  <span className="text-[10px] font-mono text-muted-foreground">wallets both sides transact with directly</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${commingleResult.tieredCounts[0] > 0 ? "bg-red-950/60 text-red-200 border-red-400/40" : "text-muted-foreground border-border/30"}`}>
                    {commingleResult.tieredCounts[0]} found
                  </span>
                </div>
                {commingleResult.tieredCounts[0] === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    No direct shared counterparties. Check Tier 2+ below for deeper connections.
                  </p>
                ) : (() => {
                  const t1priv = commingleResult.findings.filter((f) => f.tier === 1 && f.knownInfo?.type !== "exchange");
                  return (
                    <div className="space-y-3">
                      {t1priv.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono text-green-400/80 font-bold tracking-wider mb-2 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-400/80 shrink-0" />
                            Private Wallet Connections ({t1priv.length}) — Investigate First
                          </div>
                          <div className="space-y-2">
                            {t1priv.map((f, i) => (
                              <div key={f.sharedAddress} className="bg-red-950/15 border border-red-500/25 rounded-lg p-3">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <span className="text-[10px] font-mono bg-red-900/70 text-red-200 px-1.5 py-0.5 rounded border border-red-400/40 font-bold shrink-0">#{i + 1}</span>
                                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: f.sharedAddress, x: r.left, y: r.bottom + 4 }); }}
                                    className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                                  >
                                    {f.sharedAddress.length > 20 ? `${f.sharedAddress.slice(0, 10)}…${f.sharedAddress.slice(-6)}` : f.sharedAddress}
                                  </button>
                                  {f.knownInfo && getKnownBadge(f.knownInfo, "md")}
                                  {savedWallets.has(f.sharedAddress) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                                  <span className="ml-auto text-[10px] font-mono text-red-400 font-bold shrink-0">
                                    {f.comparisons.length} wallet{f.comparisons.length !== 1 ? "s" : ""} share this
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground/70 pl-1 space-y-0.5">
                                  <div><span className="text-muted-foreground/50">Target path: </span>{f.targetPath.map((a) => a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a).join(" → ")}</div>
                                  {f.comparisons.map((c) => (
                                    <div key={c.wallet}><span className="text-muted-foreground/50">Compare: </span>{c.wallet.length > 14 ? `${c.wallet.slice(0, 8)}…${c.wallet.slice(-4)}` : c.wallet} → {f.sharedAddress.length > 12 ? `${f.sharedAddress.slice(0, 6)}…${f.sharedAddress.slice(-4)}` : f.sharedAddress}</div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── § 2 Tier 2 ── */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-orange-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-orange-300 font-bold tracking-widest uppercase">§ 2 — Tier 2: Second-Degree Shared Nodes</span>
                  <span className="text-[10px] font-mono text-muted-foreground">shared 2nd-degree connections</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${commingleResult.tieredCounts[1] > 0 ? "bg-orange-950/60 text-orange-200 border-orange-400/40" : "text-muted-foreground border-border/30"}`}>
                    {commingleResult.tieredCounts[1]} found
                  </span>
                </div>
                {commingleResult.tieredCounts[1] === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">No tier-2 shared nodes.</p>
                ) : (() => {
                  const t2priv = commingleResult.findings.filter((f) => f.tier === 2 && f.knownInfo?.type !== "exchange");
                  return (
                    <div className="space-y-3">
                      {t2priv.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono text-green-400/70 font-bold tracking-wider mb-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-400/70 shrink-0" />
                            Private ({t2priv.length})
                          </div>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {t2priv.slice(0, 30).map((f, i) => (
                              <div key={f.sharedAddress} className="bg-orange-950/10 border border-orange-500/20 rounded-lg p-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-mono bg-orange-900/60 text-orange-200 px-1.5 py-0.5 rounded border border-orange-400/40 font-bold shrink-0">#{i + 1}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: f.sharedAddress, x: r.left, y: r.bottom + 4 }); }}
                                    className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                                  >
                                    {f.sharedAddress.length > 20 ? `${f.sharedAddress.slice(0, 10)}…${f.sharedAddress.slice(-6)}` : f.sharedAddress}
                                  </button>
                                  {f.knownInfo && getKnownBadge(f.knownInfo)}
                                  {savedWallets.has(f.sharedAddress) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                                  <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">
                                    {f.comparisons.length} wallet{f.comparisons.length !== 1 ? "s" : ""} · via {f.targetPath.length > 2 ? (f.targetPath[1].length > 10 ? `${f.targetPath[1].slice(0, 6)}…` : f.targetPath[1]) : "—"}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {t2priv.length > 30 && (
                              <p className="text-[10px] font-mono text-muted-foreground/50 pl-3">… and {t2priv.length - 30} more — see full report</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── § 3 Tier 3–4 ── */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-yellow-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-yellow-300 font-bold tracking-widest uppercase">§ 3 — Tier 3–4: Deep Shared Nodes</span>
                  <span className="text-[10px] font-mono text-muted-foreground">3rd and 4th degree connections</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${(commingleResult.tieredCounts[2] + commingleResult.tieredCounts[3]) > 0 ? "bg-yellow-950/60 text-yellow-200 border-yellow-400/40" : "text-muted-foreground border-border/30"}`}>
                    {commingleResult.tieredCounts[2] + commingleResult.tieredCounts[3]} found
                  </span>
                </div>
                {commingleResult.tieredCounts[2] + commingleResult.tieredCounts[3] === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">No tier 3–4 shared nodes detected.</p>
                ) : (() => {
                  const t34priv = commingleResult.findings.filter((f) => f.tier >= 3 && f.knownInfo?.type !== "exchange");
                  return (
                    <div className="space-y-3">
                      {t34priv.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono text-green-400/60 font-bold tracking-wider mb-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-400/60 shrink-0" />
                            Private ({t34priv.length})
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {t34priv.slice(0, 20).map((f, i) => (
                              <div key={f.sharedAddress} className="bg-yellow-950/10 border border-yellow-500/15 rounded-lg p-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-mono bg-yellow-900/50 text-yellow-200 px-1.5 py-0.5 rounded border border-yellow-400/30 font-bold shrink-0">#{i + 1}</span>
                                  <span className="text-[10px] font-mono text-yellow-400/70 border border-yellow-500/20 px-1 py-0.5 rounded shrink-0">T{f.tier}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: f.sharedAddress, x: r.left, y: r.bottom + 4 }); }}
                                    className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                                  >
                                    {f.sharedAddress.length > 20 ? `${f.sharedAddress.slice(0, 10)}…${f.sharedAddress.slice(-6)}` : f.sharedAddress}
                                  </button>
                                  {f.knownInfo && getKnownBadge(f.knownInfo)}
                                  {savedWallets.has(f.sharedAddress) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                                </div>
                              </div>
                            ))}
                            {t34priv.length > 20 && (
                              <p className="text-[10px] font-mono text-muted-foreground/50 pl-3">… and {t34priv.length - 20} more — see full report</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── Copy report inline ── */}
              <div className="px-5 py-4 bg-muted/5 flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-mono text-muted-foreground/70">
                    Scanned at {new Date(commingleResult.scannedAt).toLocaleString()} · {commingleResult.chain.toUpperCase()} · 4 tiers
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/50">
                    Comparison wallets: {commingleResult.comparisonWallets.length}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const rpt = generateCommingleReport();
                    navigator.clipboard.writeText(rpt).catch(() => {});
                    setCommingleReportCopied(true);
                    setTimeout(() => setCommingleReportCopied(false), 2500);
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${
                    commingleReportCopied
                      ? "border-green-500/50 text-green-400 bg-green-950/30"
                      : "border-amber-500/30 text-amber-300 hover:bg-amber-950/30 hover:border-amber-500/60"
                  }`}
                >
                  {commingleReportCopied ? <><Check className="w-3.5 h-3.5" /> COPIED!</> : <><Copy className="w-3.5 h-3.5" /> COPY REPORT</>}
                </button>
              </div>

            </div>
          )}
        </Card>
      )}

      {/* ── Victim → Thief Path Trace Panel ──────────────────────────────── */}
      {showPathPanel && (
        <Card ref={pathPanelRef} className="bg-card/40 border-rose-500/30 shadow-lg shadow-rose-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-rose-400" />
                <CardTitle className="text-sm font-mono text-rose-300 tracking-widest uppercase">
                  Victim → Thief Path Trace
                </CardTitle>
              </div>
              <button onClick={() => setShowPathPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1">
              Enter wallets in exact order — victim first, then thief, then any additional known hops.
              Paste the specific transaction hash (TA) for each step for the most precise evidence trail.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Column headers */}
            <div className="grid grid-cols-[7rem_1fr_1fr_1.5rem] gap-2 items-center px-0.5">
              <div />
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">Wallet Address</span>
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">Transaction Hash (TA)</span>
              <div />
            </div>

            {/* Hop rows */}
            <div className="space-y-2">
              {pathSteps.map((step, idx) => (
                <div key={idx} className="grid grid-cols-[7rem_1fr_1fr_1.5rem] gap-2 items-center">
                  {/* Role badge */}
                  <div className="flex items-center">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
                      idx === 0
                        ? "text-blue-300 bg-blue-950/40 border-blue-500/30"
                        : idx === 1
                        ? "text-rose-300 bg-rose-950/40 border-rose-500/30"
                        : "text-orange-300 bg-orange-950/40 border-orange-500/30"
                    }`}>
                      {idx === 0 ? "VICTIM" : idx === 1 ? "THIEF" : `HOP ${idx + 1}`}
                    </span>
                  </div>
                  {/* Wallet input */}
                  <input
                    type="text"
                    value={step.wallet}
                    onChange={(e) => {
                      const next = pathSteps.map((s, i) => i === idx ? { ...s, wallet: e.target.value } : s);
                      setPathSteps(next);
                    }}
                    placeholder={idx === 0 ? "Victim wallet address" : idx === 1 ? "Thief wallet address" : "Next hop wallet address"}
                    className="bg-background/50 border border-border/50 text-xs font-mono text-foreground px-3 py-2 rounded focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 placeholder:text-muted-foreground/40 min-w-0"
                  />
                  {/* TX hash input */}
                  <input
                    type="text"
                    value={step.txHash}
                    onChange={(e) => {
                      const next = pathSteps.map((s, i) => i === idx ? { ...s, txHash: e.target.value } : s);
                      setPathSteps(next);
                    }}
                    placeholder="TX hash (optional but recommended)"
                    className="bg-background/50 border border-border/50 text-xs font-mono text-foreground px-3 py-2 rounded focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 placeholder:text-muted-foreground/40 min-w-0"
                  />
                  {/* Remove button — only for hop 3+ */}
                  {idx >= 2 ? (
                    <button
                      onClick={() => setPathSteps(pathSteps.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-rose-400 transition-colors flex items-center justify-center"
                      title="Remove this hop"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : <div />}
                </div>
              ))}

              {/* Add hop */}
              <button
                onClick={() => setPathSteps([...pathSteps, { wallet: "", txHash: "" }])}
                className="flex items-center gap-1.5 text-[11px] font-mono text-rose-400/70 hover:text-rose-300 border border-dashed border-rose-500/20 hover:border-rose-500/40 px-3 py-1.5 rounded w-full justify-center transition-colors mt-1"
              >
                <Plus className="w-3 h-3" /> ADD NEXT HOP
              </button>
            </div>

            {/* Error */}
            {pathError && (
              <div className="text-xs font-mono text-red-400 bg-red-950/20 border border-red-500/20 rounded px-3 py-2">
                {pathError}
              </div>
            )}

            {/* Progress */}
            {pathLoading && pathProgress && (
              <div className="flex items-center gap-2 text-xs font-mono text-rose-300/80">
                <Loader2 className="w-3 h-3 animate-spin" />
                {pathProgress}
              </div>
            )}

            {/* Generate / Clear */}
            <div className="flex items-center gap-3">
              <Button
                className="font-mono text-xs bg-rose-700 hover:bg-rose-600 text-white border-0"
                onClick={runPathTrace}
                disabled={pathLoading || pathSteps.filter(s => s.wallet.trim()).length < 2}
              >
                {pathLoading
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> TRACING…</>
                  : <><Route className="w-3.5 h-3.5 mr-1.5" /> GENERATE PATH TRACE</>}
              </Button>
              <button
                onClick={() => setPathSteps([{ wallet: "", txHash: "" }, { wallet: "", txHash: "" }])}
                className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                CLEAR
              </button>
            </div>

            <p className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed">
              TX hashes are used to look up the exact transaction for each hop.
              Transactions are searched in your loaded history first, then fetched directly from the chain.
              The report also shows all further connections from the final wallet (Expand section).
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Investigative Report Modal ─────────────────────────────────────── */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowReportModal(false)}
        >
          <div
            className="relative w-full max-w-4xl bg-[#0a0c10] border border-orange-500/30 rounded-lg shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-mono text-sm text-orange-300 font-bold uppercase tracking-widest">
                  Investigative Report
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {selectedWallets.size} selected wallet{selectedWallets.size !== 1 ? "s" : ""} · {chain.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => exportAsPdf(reportTitle, reportContent)}
                  className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border border-blue-500/30 text-blue-300 hover:bg-blue-950/30 hover:border-blue-500/60 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> EXPORT PDF
                </button>
                <button
                  onClick={() => exportAsJson(reportFilename(reportTitle, "json"), reportJsonData)}
                  className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/30 hover:border-cyan-500/60 transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" /> EXPORT JSON
                </button>
                <button
                  onClick={async () => {
                    try {
                      const encoded = await encodeReportForUrl(reportTitle, reportContent);
                      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                      const url = `${window.location.origin}${base}/report-view?d=${encoded}`;
                      await navigator.clipboard.writeText(url);
                      setReportLinkCopied(true);
                      setTimeout(() => setReportLinkCopied(false), 2500);
                    } catch { /* noop */ }
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${
                    reportLinkCopied
                      ? "border-green-500/50 text-green-400 bg-green-950/30"
                      : "border-purple-500/30 text-purple-300 hover:bg-purple-950/30 hover:border-purple-500/60"
                  }`}
                >
                  {reportLinkCopied ? <><Check className="w-3.5 h-3.5" /> LINK COPIED!</> : <><ExternalLink className="w-3.5 h-3.5" /> COPY LINK</>}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(reportContent).catch(() => {});
                    setReportCopied(true);
                    setTimeout(() => setReportCopied(false), 2500);
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${
                    reportCopied
                      ? "border-green-500/50 text-green-400 bg-green-950/30"
                      : "border-orange-500/30 text-orange-300 hover:bg-orange-950/30 hover:border-orange-500/60"
                  }`}
                >
                  {reportCopied ? <><Check className="w-3.5 h-3.5" /> COPIED!</> : <><Copy className="w-3.5 h-3.5" /> COPY TEXT</>}
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Report body */}
            <div className="overflow-y-auto flex-1 p-5">
              <pre className="font-mono text-[11px] leading-relaxed text-green-300/90 whitespace-pre-wrap break-all bg-transparent select-all">
                {reportContent}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border/30 shrink-0 flex items-center justify-between gap-3 flex-wrap bg-muted/5">
              <span className="text-[10px] font-mono text-muted-foreground/50">
                Click outside to close · PDF opens a print dialog — choose "Save as PDF"
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAsPdf(reportTitle, reportContent)}
                  className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border border-blue-500/30 text-blue-300 hover:bg-blue-950/30 transition-colors"
                >
                  <Download className="w-3 h-3" /> EXPORT PDF
                </button>
                <button
                  onClick={() => exportAsJson(reportFilename(reportTitle, "json"), reportJsonData)}
                  className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/30 transition-colors"
                >
                  <FileJson className="w-3 h-3" /> EXPORT JSON
                </button>
                <button
                  onClick={async () => {
                    try {
                      const encoded = await encodeReportForUrl(reportTitle, reportContent);
                      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                      const url = `${window.location.origin}${base}/report-view?d=${encoded}`;
                      await navigator.clipboard.writeText(url);
                      setReportLinkCopied(true);
                      setTimeout(() => setReportLinkCopied(false), 2500);
                    } catch { /* noop */ }
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${
                    reportLinkCopied
                      ? "border-green-500/50 text-green-400 bg-green-950/30"
                      : "border-purple-500/30 text-purple-300 hover:bg-purple-950/30"
                  }`}
                >
                  {reportLinkCopied ? <><Check className="w-3 h-3" /> LINK COPIED!</> : <><ExternalLink className="w-3 h-3" /> COPY LINK</>}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(reportContent).catch(() => {});
                    setReportCopied(true);
                    setTimeout(() => setReportCopied(false), 2500);
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${
                    reportCopied
                      ? "border-green-500/50 text-green-400 bg-green-950/30"
                      : "border-orange-500/30 text-orange-300 hover:bg-orange-950/30"
                  }`}
                >
                  {reportCopied ? <><Check className="w-3 h-3" /> COPIED!</> : <><Copy className="w-3 h-3" /> COPY TEXT</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
