   const cfg = require("../config");
const TG = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;
const GROQ_KEY = process.env.GROQ_API_KEY;

async function tg(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function sendMsg(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" });
}

async function sendPhoto(chatId, photo, caption) {
  return tg("sendPhoto", { chat_id: chatId, photo, caption });
}

async function sendVideo(chatId, video, caption) {
  return tg("sendVideo", { chat_id: chatId, video, caption });
}

async function forwardToOwners(text) {
  for (const id of cfg.owners) await sendMsg(id, text);
}

async function groqReply(messages) {
  const p = Object.values(cfg.products)[0];
  const system = `You are Bangladesh Income Hub professional AI sales assistant. Always reply in Bangla. Be professional and friendly. Use "ভাইজান" and "আপনি". Use Islamic greetings.

You know:
- Product: ${p.name} - ${p.price}
- Description: ${p.description}
- Features: ${p.features.join(", ")}
- bKash: ${cfg.bkash.number} (${cfg.bkash.name})
- Support: @NazmulHasan95

Rules:
- Guide to /buy for purchase
- After payment screenshot ask for TradingView credentials
- After credentials say 24 hours delivery
- Keep replies short and helpful`;

  const msgs = [{ role: "system", content: system }];
  for (const h of messages) {
    msgs.push({ role: h.role === "model" ? "assistant" : "user", content: h.text });
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: msgs,
        max_tokens: 400,
        temperature: 0.7
      })
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "দুঃখিত ভাইজান, সমস্যা হচ্ছে। @NazmulHasan95 এ যোগাযোগ করুন।";
  } catch (e) {
    return "দুঃখিত ভাইজান, reply দিতে পারছি না। @NazmulHasan95 এ যোগাযোগ করুন।";
  }
}

function detectIntent(text) {
  const t = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(cfg.intents)) {
    if (keywords.some(k => t.includes(k))) return intent;
  }
  return "general";
}

const conversations = {};
function addHistory(chatId, role, text) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role, text });
  if (conversations[chatId].length > 10) conversations[chatId].shift();
}

const WELCOME = `আসসালামু আলাইকুম ওয়ারাহমাতুল্লাহ! 🌙

*বাংলাদেশ ইনকাম হাব* এ আপনাকে স্বাগতম ভাইজান!

আমরা Professional TradingView Indicators তৈরি ও বিক্রি করি।

━━━━━━━━━━━━━━━━━━
📊 *Featured Product:*
━━━━━━━━━━━━━━━━━━

🔥 *BDIH Final Version Indicator*

✅ Non-Repaint — signal কখনো পরিবর্তন হয় না
✅ Non-MTG — অত্যন্ত accurate
✅ প্রতিদিন ২৫০+ trading signal
✅ Entry, Take Profit ও Stop Loss সহ
✅ সকল timeframe এ কার্যকর

💰 *মূল্য: মাত্র 5,000 BDT*
~~নিয়মিত মূল্য: 10,000 BDT~~

━━━━━━━━━━━━━━━━━━
🛒 *মাত্র ৩টি ধাপে পান:*
━━━━━━━━━━━━━━━━━━

1️⃣ bKash এ payment করুন
2️⃣ Payment screenshot পাঠান
3️⃣ TradingView email ও password দিন
→ ২৪ ঘন্টায় indicator set হবে ✅

━━━━━━━━━━━━━━━━━━
📌 *Menu:*
━━━━━━━━━━━━━━━━━━

/indicator — বিস্তারিত জানুন
/buy — কেনার নিয়ম
/products — সকল products
/support — সাহায্য

যেকোনো প্রশ্ন করুন ভাইজান! 🤝`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });
  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat.id);
    const username = message.from?.username || message.from?.first_name || "Unknown";
    const text = message.text || "";
    const photo = message.photo;
    const video = message.video;
    const isOwner = cfg.owners.includes(chatId);

    if (isOwner && text.startsWith("REPLY:")) {
      const parts = text.replace("REPLY:", "").split(":");
      const targetId = parts[0].trim();
      const replyText = parts.slice(1).join(":").trim();
      if (targetId && replyText) {
        await sendMsg(targetId, `📩 *Bangladesh Income Hub:*\n\n${replyText}`);
        await sendMsg(chatId, `✅ Delivered to ${targetId}`);
      }
      return res.status(200).json({ ok: true });
    }

    if (isOwner && (photo || video) && message.caption) {
      const targetId = message.caption.match(/\d{6,}/)?.[0];
      if (targetId) {
        if (photo) await sendPhoto(targetId, photo[photo.length - 1].file_id, "📊 Bangladesh Income Hub");
        if (video) await sendVideo(targetId, video.file_id, "🎥 Bangladesh Income Hub");
        await sendMsg(chatId, `✅ Media sent to ${targetId}`);
        return res.status(200).json({ ok: true });
      }
    }

    if (!isOwner && photo) {
      await sendMsg(chatId, `✅ *Payment screenshot পেয়েছি ভাইজান!*

জাযাকাল্লাহ খায়রান! 🙏

এখন আপনার *TradingView login তথ্য* পাঠান:

📧 Email: আপনার TradingView email
🔒 Password: আপনার TradingView password

_তথ্য পাওয়ার পর ২৪ ঘন্টার মধ্যে indicator set হবে ইনশাআল্লাহ।_`);
      for (const id of cfg.owners) {
        await sendPhoto(id, photo[photo.length - 1].file_id,
          `PAYMENT SCREENSHOT\n@${username}\nChat ID: ${chatId}\nReply: REPLY:${chatId}: message`);
      }
      return res.status(200).json({ ok: true });
    }

    if (!isOwner && video) {
      await forwardToOwners(`Video from @${username} (${chatId})`);
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      const p = Object.values(cfg.products)[0];

      if (cmd === "/start") {
        await sendMsg(chatId, WELCOME);
        await forwardToOwners(`New user: @${username} (${chatId})`);
      } else if (cmd === "/indicator") {
        await sendMsg(chatId, `📊 *${p.name}*\n\n${p.description}\n\n${p.features.map(f => `✅ ${f}`).join("\n")}\n\n💰 *মূল্য: ${p.price}*\n\nকিনতে /buy লিখুন।`);
      } else if (cmd === "/buy") {
        await sendMsg(chatId, `🛒 *Indicator কেনার নিয়ম:*

━━━━━━━━━━━━━━━━━━
💳 *Step 1: bKash Payment*
━━━━━━━━━━━━━━━━━━

📱 Number: *${cfg.bkash.number}*
👤 Name: ${cfg.bkash.name}
💰 Amount: *${p.price}*
🔄 Type: ${cfg.bkash.type}

━━━━━━━━━━━━━━━━━━
📸 *Step 2: Screenshot পাঠান*
━━━━━━━━━━━━━━━━━━

Payment এর screenshot এই chat এ পাঠান।

━━━━━━━━━━━━━━━━━━
🔑 *Step 3: TradingView তথ্য দিন*
━━━━━━━━━━━━━━━━━━

Email ও password পাঠালে ২৪ ঘন্টায় indicator set হবে।

📞 Direct contact: @NazmulHasan95

আল্লাহ বরকত দিন! 🤲`);
      } else if (cmd === "/products") {
        const list = Object.values(cfg.products).map(pr => `✅ *${pr.name}* — ${pr.price}`).join("\n\n");
        await sendMsg(chatId, `🛍️ *আমাদের সকল Products:*\n\n${list}\n\n📞 Contact: @NazmulHasan95`);
      } else if (cmd === "/support") {
        await sendMsg(chatId, `🆘 *Support Center*\n\nআপনার সমস্যা লিখুন অথবা সরাসরি যোগাযোগ করুন:\n\n📞 @NazmulHasan95`);
        await forwardToOwners(`Support request: @${username} (${chatId})`);
      }
      return res.status(200).json({ ok: true });
    }

    if (text && !isOwner) {
      const intent = detectIntent(text);

      if (intent === "credentials") {
        await sendMsg(chatId, `🔑 *TradingView তথ্য পেয়েছি ভাইজান!*

জাযাকাল্লাহ খায়রান! 🙏

⏰ *২৪ ঘন্টার মধ্যে indicator set হবে ইনশাআল্লাহ।*

সমস্যায় যোগাযোগ করুন: @NazmulHasan95 ✅`);
        await forwardToOwners(`CREDENTIALS: @${username} (${chatId})\n${text}\nReply: REPLY:${chatId}: message`);
        return res.status(200).json({ ok: true });
      }

      const labels = { buy: "WANTS TO BUY", video: "WANTS VIDEO", support: "NEEDS SUPPORT", greet: "GREETING", general: "MESSAGE" };
      await forwardToOwners(`${labels[intent] || "MESSAGE"}\n@${username} (${chatId})\n"${text}"\nReply: REPLY:${chatId}: message`);

      addHistory(chatId, "user", text);
      const reply = await groqReply(conversations[chatId]);
      addHistory(chatId, "model", reply);
      await sendMsg(chatId, reply);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error:", err);
    return res.status(200).json({ ok: true });
  }
}
