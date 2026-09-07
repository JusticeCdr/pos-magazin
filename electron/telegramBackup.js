// electron/telegramBackup.js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getSettings, getDBPath } = require('./database');

/**
 * Automatically fetch Chat ID from Telegram Bot updates
 * When user adds the bot to a group and types /id
 */
async function getTelegramChatIdFromUpdates(customToken) {
  try {
    const settings = getSettings();
    const token = customToken || (settings.data ? settings.data.telegram_bot_token : '') || '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84';
    
    if (!token) {
      return { success: false, error: "Telegram bot token kiritilmagan!" };
    }

    const url = `https://api.telegram.org/bot${token}/getUpdates`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return { 
        success: false, 
        error: "Telegram xabarlari topilmadi. Botni Telegram guruhga qo'shib, guruh ichida /id deb yozing, so'ng ushbu tugmani qayta bosing." 
      };
    }

    let foundChatId = null;
    let foundChatTitle = "Telegram Guruh";

    // Search backwards for group or message containing /id
    for (let i = data.result.length - 1; i >= 0; i--) {
      const update = data.result[i];
      const msg = update.message || update.edited_message || update.channel_post || (update.my_chat_member ? update.my_chat_member.chat : null);
      
      const chat = msg && msg.chat ? msg.chat : msg;
      if (chat && chat.id) {
        if (chat.type === 'group' || chat.type === 'supergroup' || String(chat.id).startsWith('-')) {
          foundChatId = String(chat.id);
          foundChatTitle = chat.title || chat.username || "Telegram Guruh";
          break;
        }
      }
    }

    // Fallback: take the latest chat
    if (!foundChatId) {
      const lastUpdate = data.result[data.result.length - 1];
      const lastChat = lastUpdate && lastUpdate.message ? lastUpdate.message.chat : null;
      if (lastChat && lastChat.id) {
        foundChatId = String(lastChat.id);
        foundChatTitle = lastChat.title || lastChat.username || "Telegram Guruh";
      }
    }

    if (foundChatId) {
      // Send confirmation reply into the Telegram chat so the user sees the bot respond in Telegram
      const storeName = (settings.data ? settings.data.store_name : '') || 'xxMpos';
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: foundChatId,
            text: `✅ *Bot xxMpos tizimiga muvaffaqiyatli ulandi!*\n\n🏬 *Tashkilot:* ${storeName}\n🆔 *Guruh Chat ID:* \`${foundChatId}\`\n\n📌 Baza zaxira fayllari ushbu guruhga avtomatik yuboriladi.`,
            parse_mode: 'Markdown'
          })
        });
      } catch (_) {}

      return {
        success: true,
        chatId: foundChatId,
        chatTitle: foundChatTitle
      };
    }

    return { 
      success: false, 
      error: "Guruh ID si topilmadi. Botni guruhga Admin qilib qo'shing va guruhda /id deb yozing." 
    };
  } catch (err) {
    return { success: false, error: "Internet yoki Telegram API xatoligi: " + err.message };
  }
}

/**
 * Creates a safe snapshot of SQLite database and sends document to Telegram group.
 */
async function sendTelegramBackup(options = {}) {
  let tempBackupPath = null;
  try {
    const settings = getSettings();
    const botToken = options.botToken || (settings.data ? settings.data.telegram_bot_token : '') || '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84';
    const chatId = options.chatId || (settings.data ? settings.data.telegram_chat_id : '');
    const rawStoreName = (settings.data ? settings.data.store_name : '') || 'xxMpos';

    if (!botToken) {
      return { success: false, error: "Telegram bot token sozlamalardan kiritilmagan!" };
    }
    if (!chatId) {
      return { success: false, error: "Telegram Guruh Chat ID sozlamalardan kiritilmagan! Botni guruhga qo'shib, Chat ID ni kiriting." };
    }

    // 1. Safe Snapshot
    const originalDbPath = options.dbPath || getDBPath();
    if (!fs.existsSync(originalDbPath)) {
      return { success: false, error: `Ma'lumotlar bazasi fayli topilmadi: ${originalDbPath}` };
    }

    const userDataDir = app ? app.getPath('userData') : path.dirname(originalDbPath);
    tempBackupPath = path.join(userDataDir, `temp_backup_${Date.now()}.db`);

    // Safely copy database snapshot
    fs.copyFileSync(originalDbPath, tempBackupPath);

    // 2. Metadata formatting
    const safeStoreName = rawStoreName.replace(/[\/\\:*?"<>|\s]/g, '_');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const formattedFileName = `${safeStoreName}_${dateStr}_backup.db`;

    const fileStats = fs.statSync(tempBackupPath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    const caption = 
      `📦 *ЯНГИ ЗАХИРА НУСХАСИ*\n` +
      `🏬 Объект: ${rawStoreName}\n` +
      `📅 Сана: ${now.toLocaleString('uz-UZ')}\n` +
      `💾 Ҳажми: ${fileSizeMB} MB\n` +
      `✅ Ҳолати: Муваффақиятли сақланди`;

    // 3. Send via multipart/form-data using FormData & fetch
    const fileBuffer = fs.readFileSync(tempBackupPath);
    const fileBlob = new Blob([fileBuffer], { type: 'application/x-sqlite3' });

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', fileBlob, formattedFileName);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.description || "Telegram API ga yuborishda xatolik");
    }

    return {
      success: true,
      message: "Baza muvaffaqiyatli Telegram guruhga yuborildi!",
      file: formattedFileName,
      sizeMB: fileSizeMB,
      telegramResponse: result.result
    };
  } catch (err) {
    return {
      success: false,
      error: "Telegramga zaxirani yuborishda xatolik: " + err.message
    };
  } finally {
    // 4. Cleanup
    if (tempBackupPath && fs.existsSync(tempBackupPath)) {
      try {
        fs.unlinkSync(tempBackupPath);
      } catch (_) {}
    }
  }
}

/**
 * Sends a test message to the configured Attendance Telegram group
 */
async function sendAttendanceTestMessage(options = {}) {
  try {
    const settings = getSettings();
    const token = (options.token || (settings.data ? settings.data.telegram_attendance_token : '') || '8621843458:AAGBnjR3LwNDWfnKnnKmB9EQpqlm57tnr84').trim();
    const chatId = (options.chatId || (settings.data ? settings.data.telegram_attendance_chat_id : '')).trim();
    const cafeName = (options.cafeName || (settings.data ? (settings.data.cafe_name || settings.data.store_name) : '') || 'Kafe').trim();

    if (!token) {
      return { success: false, error: "Telegram bot tokeni kiritilmagan!" };
    }
    if (!chatId) {
      return { success: false, error: "Telegram guruh Chat ID kiritilmagan! Botni guruhga qo'shing va Chat ID ni kiriting." };
    }

    const message = `✅ Aloqa o'rnatildi! ${cafeName} uchun davomat xabarlari ushbu guruhga keladi.`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.description || "Telegram API ga xabar yuborishda xatolik");
    }

    return {
      success: true,
      message: "Guruhga ulandi!",
      telegramResponse: result.result
    };
  } catch (err) {
    return {
      success: false,
      error: "Telegram xatoligi: " + err.message
    };
  }
}

module.exports = {
  sendTelegramBackup,
  getTelegramChatIdFromUpdates,
  sendAttendanceTestMessage
};
