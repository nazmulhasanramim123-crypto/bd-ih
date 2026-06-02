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

// ✅ FIX 1: parse_mode HTML — underscore (_) সমস্যা দূর হবে
async function sendMsg(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
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
  const productList = Object.values(cfg.products)
    .map(p => `${p.name}: ${p.price}`).join(", ");

  const system = `তুমি Bangladesh Income Hub এর professional AI sales assistant। সবসময় Bangla তে reply করবে। ভদ্র এবং professional হবে। "ভাইজান" এবং "আপনি" ব্যবহার করবে।

তুমি জানো:
- Products: ${productList}
- bKash: ${cfg.bkash.number} (${cfg.bkash.name})
- Support: ${cfg.ownerTelegram}

নিয়ম:
- কিনতে চাইলে /buy লিখতে বলো
- Support এর জন্য ${cfg.ownerTelegram} এ যেতে বলো
- সংক্ষিপ্ত এবং helpful reply দাও
- কখনো false promise করো না`;

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
    return data?.choices?.[0]?.message?.content ||
      `দুঃখিত ভাইজান, সমস্যা হচ্ছে। ${cfg.ownerTelegram} এ যোগাযোগ করুন।`;
  } catch (e) {
    return `দুঃখিত ভাইজান, reply দিতে পারছি না। ${cfg.ownerTelegram} এ যোগাযোগ করুন।`;
  }
}

function detectIntent(text) {
  const t = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(cfg.intents)) {
    if (keywords.some(k => t.includes(k))) return intent;
  }
  return "general";
}

// ✅ FIX 2: *bold* এর বদলে <b>bold</b> — HTML format
function buildProductList() {
  return Object.values(cfg.products)
    .map((p, i) => `${i + 1}. <b>${p.name}</b>\n   💰 ${p.price}`)
    .join("\n\n");
}

const conversations = {};
function addHistory(chatId, role, text) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role, text });
  if (conversations[chatId].length > 10) conversations[chatId].shift();
}

// ✅ FIX 3: WELCOME message — *bold* → <b>bold</b>
const WELCOME = `আসসালামু আলাইকুম ওয়ারাহমাতুল্লাহ! 🌙

<b>বাংলাদেশ ইনকাম হাব</b> এ আপনাকে স্বাগতম ভাইজান!

আমরা Professional TradingView Indicators তৈরি ও সরবরাহ করি।

━━━━━━━━━━━━━━━━━━
📊 <b>আমাদের Service:</b>
━━━━━━━━━━━━━━━━━━

আমরা আপনার জন্য:
✅ নতুন TradingView account তৈরি করি
✅ Indicator setup করে দিই
✅ ২৪ ঘন্টার মধ্যে সব সম্পন্ন করি

━━━━━━━━━━━━━━━━━━
📌 <b>Quick Menu:</b>
━━━━━━━━━━━━━━━━━━

/indicator — Indicator সম্পর্কে জানুন
/buy — কেনার সম্পূর্ণ গাইড
/products — সকল products দেখুন
/support — সাহায্য বা যোগাযোগ

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
        await sendMsg(targetId,
          `📩 <b>Bangladesh Income Hub — Team Message:</b>\n\n${replyText}\n\n<i>আরো সাহায্যের জন্য ${cfg.ownerTelegram} এ যোগাযোগ করুন।</i>`);
        await sendMsg(chatId, `✅ Message delivered to client (${targetId})`);
      }
      return res.status(200).json({ ok: true });
    }

    if (isOwner && (photo || video) && message.caption) {
      const targetId = message.caption.match(/\d{6,}/)?.[0];
      if (targetId) {
        if (photo) await sendPhoto(targetId, photo[photo.length - 1].file_id,
          "📊 Bangladesh Income Hub — আপনার indicator ready!");
        if (video) await sendVideo(targetId, video.file_id,
          "🎥 Bangladesh Income Hub — Team message");
        await sendMsg(chatId, `✅ Media delivered to client (${targetId})`);
        return res.status(200).json({ ok: true });
      }
    }

    if (!isOwner && photo) {
      await sendMsg(chatId,
        `✅ <b>Payment screenshot সফলভাবে পেয়েছি ভাইজান!</b>

জাযাকাল্লাহ খায়রান! 🙏

এখন শুধু আপনার <b>নতুন Email এবং Password</b> পাঠান:

📧 <b>Email:</b> আপনার নতুন Gmail address
🔒 <b>Password:</b> Gmail এর password

<i>সব তথ্য পাওয়ার পর ২৪ ঘন্টার মধ্যে:</i>
<i>✅ TradingView account তৈরি হবে</i>
<i>✅ Indicator setup হবে</i>
<i>✅ আপনাকে জানানো হবে ইনশাআল্লাহ</i>`);

      for (const id of cfg.owners) {
        await sendPhoto(id, photo[photo.length - 1].file_id,
          `Payment received!\n@${username}\nChat ID: ${chatId}`);
      }
      return res.status(200).json({ ok: true });
    }

    if (!isOwner && video) {
      await forwardToOwners(`Video from @${username} (${chatId})`);
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      const firstProduct = Object.values(cfg.products)[0];

      if (cmd === "/start") {
        await sendMsg(chatId, WELCOME);
        await forwardToOwners(`New user: @${username} (${chatId})`);

      } else if (cmd === "/indicator") {
        await sendMsg(chatId,
          `📊 <b>${firstProduct.name}</b>\n\n${firstProduct.description}\n\n${firstProduct.features.map(f => `✅ ${f}`).join("\n")}\n\n💰 <b>মূল্য: ${firstProduct.price}</b>\n\nকিনতে /buy লিখুন ভাইজান।`);

      } else if (cmd === "/buy") {
        await sendMsg(chatId,
          `🛒 <b>Indicator কেনার সম্পূর্ণ গাইড:</b>

━━━━━━━━━━━━━━━━━━
📊 <b>Available Indicators:</b>
━━━━━━━━━━━━━━━━━━

${buildProductList()}

━━━━━━━━━━━━━━━━━━
📧 <b>Step 1: নতুন Email তৈরি করুন</b>
━━━━━━━━━━━━━━━━━━

প্রথমে একটি নতুন Gmail account তৈরি করুন।
এই email দিয়ে TradingView account খোলা হবে।

━━━━━━━━━━━━━━━━━━
💳 <b>Step 2: bKash Payment করুন</b>
━━━━━━━━━━━━━━━━━━

📱 Number: <b>${cfg.bkash.number}</b>
👤 Name: ${cfg.bkash.name}
🔄 Type: ${cfg.bkash.type}
💰 Amount: আপনার indicator এর মূল্য

━━━━━━━━━━━━━━━━━━
📤 <b>Step 3: Telegram এ পাঠান</b>
━━━━━━━━━━━━━━━━━━

${cfg.ownerTelegram} এ পাঠান:
✅ bKash payment screenshot
✅ নতুন Gmail address
✅ Gmail password
✅ কোন indicator চান উল্লেখ করুন

━━━━━━━━━━━━━━━━━━
⏰ <b>২৪ ঘন্টার মধ্যে পাবেন:</b>
━━━━━━━━━━━━━━━━━━

✅ নতুন TradingView account
✅ Indicator setup সম্পন্ন
✅ Confirmation message

━━━━━━━━━━━━━━━━━━
🎁 <b>আমাদের সাথে পাচ্ছেন:</b>
━━━━━━━━━━━━━━━━━━

✅ ২৪ ঘন্টার মধ্যে সম্পূর্ণ setup
✅ Lifetime support
✅ Money management guidance
✅ Risk management guidance

📞 যোগাযোগ: ${cfg.ownerTelegram}
আল্লাহ বরকত দিন! 🤲`);

      } else if (cmd === "/products") {
        // ✅ FIX 4: cfg.ownerTelegram থেকে আসবে — underscore সমস্যা নেই
        await sendMsg(chatId,
          `🛍️ <b>Bangladesh Income Hub — সকল Products:</b>\n\n${buildProductList()}\n\n━━━━━━━━━━━━━━━━━━\nকিনতে /buy লিখুন অথবা যোগাযোগ করুন:\n📞 ${cfg.ownerTelegram}`);

      } else if (cmd === "/support") {
        // ✅ FIX 5: _italic_ → <i>italic</i> — underscore সমস্যা দূর
        await sendMsg(chatId,
          `🆘 <b>Support Center</b>\n\nআপনার সমস্যা বা প্রশ্ন লিখুন।\n\n📞 Direct contact: ${cfg.ownerTelegram}\n\n<i>আমাদের team শীঘ্রই সাহায্য করবে ইনশাআল্লাহ।</i>`);
        await forwardToOwners(`Support: @${username} (${chatId})`);
      }
      return res.status(200).json({ ok: true });
    }

    if (text && !isOwner) {
      const intent = detectIntent(text);

      if (intent === "credentials") {
        await sendMsg(chatId,
          `🔑 <b>তথ্য সফলভাবে পেয়েছি ভাইজান!</b>

জাযাকাল্লাহ খায়রান! 🙏

আমাদের team কাজ শুরু করেছে।

⏰ <b>২৪ ঘন্টার মধ্যে:</b>
✅ TradingView account তৈরি হবে
✅ Indicator setup হবে
✅ আপনাকে confirm করা হবে

যেকোনো সমস্যায়: ${cfg.ownerTelegram} ✅`);

        await forwardToOwners(
          `CREDENTIALS: @${username} (${chatId})\n${text}`);
        return res.status(200).json({ ok: true });
      }

      const labels = {
        buy: "WANTS TO BUY",
        video: "WANTS VIDEO",
        support: "NEEDS SUPPORT",
        greet: "GREETING",
        general: "MESSAGE"
      };

      await forwardToOwners(
        `${labels[intent] || "MESSAGE"}\n@${username} (${chatId})\n"${text}"`);

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
