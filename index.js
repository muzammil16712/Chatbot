const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")

// Load messages
let messages = {}
try {
  messages = JSON.parse(fs.readFileSync("messages.json", "utf8"))
} catch (err) {
  console.error("Error loading messages.json", err)
}

// Heroku keep-alive server
const app = express()
app.get("/", (req, res) => res.send("✅ Online Earning Bot is running"))
app.listen(process.env.PORT || 3000, () => console.log("Server running..."))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const sock = makeWASocket({ auth: state })

  // Save login
  sock.ev.on("creds.update", saveCreds)

  // Show QR on console
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("✅ Bot is connected!")
  })

  // Listen for messages
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

    // Personalized welcome
    const welcome = `👋 ${msg.pushName}, welcome 🤗 to watch ads and earn now!\n\n❓ Have you joined our community?`

    if (text.toLowerCase() in messages.greetings) {
      await sock.sendMessage(from, { text: messages.greetings[text.toLowerCase()] })
    } else {
      // Send welcome with buttons
      await sock.sendMessage(from, {
        text: welcome,
        buttons: [
          { buttonId: "yes_joined", buttonText: { displayText: "✅ Yes" }, type: 1 },
          { buttonId: "no_not_joined", buttonText: { displayText: "❌ No" }, type: 1 }
        ],
        headerType: 1
      })
    }

    // Button reply handling
    sock.ev.on("messages.upsert", async (m) => {
      const buttonMsg = m.messages[0]
      if (!buttonMsg?.message?.buttonsResponseMessage) return

      const btnId = buttonMsg.message.buttonsResponseMessage.selectedButtonId
      const jid = buttonMsg.key.remoteJid

      if (btnId === "yes_joined") {
        await sock.sendMessage(jid, { text: "🎉 Thanks for joining! Kindly save my number and send screenshot please 🙏" })
      } else if (btnId === "no_not_joined") {
        await sock.sendMessage(jid, { text: "📢 Please join our community here: https://chat.whatsapp.com/YourCommunityLink" })
      }
    })
  })
}

startBot()
