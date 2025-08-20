const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const Pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_req, res) => res.send("Online Earning With Ads bot is running ✅"));
app.listen(PORT, () => console.log(`🌍 Web server on ${PORT}`));

const CONFIG = {
  BRAND_NAME: process.env.BRAND_NAME || "Online Earning With Ads",
  OWNER_NAME: process.env.OWNER_NAME || "Online Earning With Ads",
  COMMUNITY_LINK: process.env.COMMUNITY_LINK || "https://example.com/join",
  WELCOME_TEXT: process.env.WELCOME_TEXT || "Welcome 🤗 to watch ads and earn now"
};

const TEMPLATES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "messages.json"), "utf8")
);

function renderButtons(buttons) {
  return buttons.map((b) => ({
    buttonId: b.id,
    buttonText: { displayText: b.text },
    type: 1
  }));
}

function mentionTag(name) {
  if (!name) return "";
  return `@${String(name).replace(/\s+/g, "_")}`;
}

async function sendTemplate(sock, jid, templateId) {
  const all = TEMPLATES.templates || [];
  const t = all.find((x) => x.id === templateId) || all[0];
  if (!t) return;
  await sock.sendMessage(jid, {
    text: t.text,
    buttons: renderButtons(t.buttons),
    footer: CONFIG.BRAND_NAME,
    headerType: 1
  });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: Pino({ level: "silent" }),
    browser: ["HerokuBot", "Chrome", "18.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "open") console.log("✅ WhatsApp connected.");
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages && messages[0];
    if (!msg || !msg.message) return;

    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith("@g.us")) return; // ignore groups

    const pushName = msg.pushName || "";
    const userTag = mentionTag(pushName || jid.split("@")[0]);

    const selectedBtn =
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.templateButtonReplyMessage?.selectedId ||
      null;

    // Handle button clicks first
    if (selectedBtn) {
      if (selectedBtn === "btn_yes") {
        await sock.sendMessage(jid, {
          text:
            "Thanks for joining 🙏 Kindly save my number and send screenshot please."
        });
        return;
      }
      if (selectedBtn === "btn_no") {
        await sock.sendMessage(jid, {
          text: `Join our community now 👇\n${CONFIG.COMMUNITY_LINK}`
        });
        return;
      }
      if (selectedBtn === "open_menu") {
        await sendTemplate(sock, jid, "t1");
        return;
      }

      // Template replies map
      const map = TEMPLATES.responses || {};
      if (map[selectedBtn]) {
        const out = String(map[selectedBtn]).replace(
          "{{COMMUNITY_LINK}}",
          CONFIG.COMMUNITY_LINK
        );
        await sock.sendMessage(jid, { text: out });
        if (selectedBtn === "main_menu") {
          await sendTemplate(sock, jid, "t1");
        }
        return;
      }
    }

    // Any text/image/video -> default welcome with 4 buttons
    const welcome = `*${CONFIG.BRAND_NAME}*\n${userTag} ${CONFIG.WELCOME_TEXT}\n\nKya apne hamari community join ki hai?`;
    await sock.sendMessage(jid, {
      text: welcome,
      mentions: [jid],
      buttons: [
        { buttonId: "btn_yes", buttonText: { displayText: "✅ Yes" }, type: 1 },
        { buttonId: "btn_no", buttonText: { displayText: "❌ No" }, type: 1 },
        { buttonId: "open_menu", buttonText: { displayText: "🏠 Main Menu" }, type: 1 },
        { buttonId: "contact_admin", buttonText: { displayText: "👨‍✈️ Contact Admin" }, type: 1 }
      ],
      footer: CONFIG.OWNER_NAME,
      headerType: 1
    });
  });

  // keep-alive
  setInterval(() => {
    try { sock.sendPresenceUpdate("available"); } catch {}
  }, 25000);
}

startBot();
