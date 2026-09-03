import { logoBase64 } from './logoBase64.js';
import { parseSQLiteDate } from './utils.js';

const receiptTranslations = {
  uz: {
    murojaat: "Murojaat uchun:",
    manzil: "Manzil:",
    qaytaChek: "Qayta chiqarilgan chek",
    chekN: "Chek N:",
    sana: "Sana:",
    kassir: "Kassir:",
    jami: "JAMI:",
    savdoSummasi: "Savdo summasi:",
    chegirma: "Chegirma",
    tolovTuri: "To'lov turi:",
    izoh: "Izoh:",
    rahmat: "Xaridingiz uchun rahmat!",
    disclaimer: "Ushbu chek ichki hisob-kitob uchun.<br>Fiskal (soliq) cheki hisoblanmaydi!<br>Iltimos, kassirdan rasmiy fiskal chek talab qiling.",
    naqd: "Naqd pul",
    card: "Plastik karta",
    debt: "Qarzga",
    usluga: "Xizmat haqi"
  },
  ru: {
    murojaat: "Для справок:",
    manzil: "Адрес:",
    qaytaChek: "Повторно распечатанный чек",
    chekN: "Чек №:",
    sana: "Дата:",
    kassir: "Кассир:",
    jami: "ИТОГО:",
    savdoSummasi: "Сумма продажи:",
    chegirma: "Скидка",
    tolovTuri: "Тип оплаты:",
    izoh: "Примечание:",
    rahmat: "Спасибо за покупку!",
    disclaimer: "Этот чек предназначен для внутреннего учета.<br>Не является фискальным чеком!<br>Пожалуйста, требуйте официальный фискальный чек у кассира.",
    naqd: "Наличные",
    card: "Пластиковая карта",
    debt: "В долг",
    usluga: "Обслуживание"
  }
};

const zReportTranslations = {
  uz: {
    zReport: "Z-HISOBOT",
    shiftClose: "Smena yopilishi",
    openedAt: "Ochilgan vaqti:",
    closedAt: "Yopilgan vaqti:",
    openedBy: "Smena ochgan:",
    closedBy: "Smena yopgan:",
    jamiSavdo: "JAMI SAVDO:",
    naqd: "Naqd pul:",
    card: "Plastik karta:",
    debt: "Qarzga:",
    chegirmalar: "Chegirmalar:",
    vozvrat: "Qaytarilgan cheklar",
    rashod: "Chiqim (Rasxod):",
    kassadagiNaqd: "KASSADAGI NAQD PUL:",
    cheklarSoni: "Cheklar soni:",
    rahmat: "Xaridingiz uchun rahmat!"
  },
  ru: {
    zReport: "Z-ОТЧЕТ",
    shiftClose: "Закрытие смены",
    openedAt: "Время открытия:",
    closedAt: "Время закрытия:",
    openedBy: "Смену открыл:",
    closedBy: "Смену закрыл:",
    jamiSavdo: "ОБЩИЕ ПРОДАЖИ:",
    naqd: "Наличные:",
    card: "Пластиковая карта:",
    debt: "В долг:",
    chegirmalar: "Скидки:",
    vozvrat: "Возвращенные чеки",
    rashod: "Расход (Выдача):",
    kassadagiNaqd: "НАЛИЧНЫЕ В КАССЕ:",
    cheklarSoni: "Количество чеков:",
    rahmat: "Спасибо за покупку!"
  }
};

export function generateReceiptHTML({ saleData, storeName, cashierName, isReprint = false, contactPhones }) {
  const { cartItems, total, paymentMethod, saleId, date, comment } = saleData;

  const formatNumber = (num) => {
    return Number(num).toLocaleString('ru-RU');
  };

  const receiptLang = (typeof localStorage !== 'undefined' ? localStorage.getItem('receipt_lang') : null) || 'uz';
  const labels = receiptTranslations[receiptLang] || receiptTranslations.uz;

  const totalOriginalAll = (cartItems || []).reduce((sum, item) => {
    return sum + (item.qty * item.sell_price);
  }, 0);

  const overallDiscountAmount = totalOriginalAll - total;
  const overallDiscountPercent = totalOriginalAll > 0 ? Math.round((overallDiscountAmount / totalOriginalAll) * 100) : 0;

  const serviceFeePercent = parseFloat(saleData.serviceFeePercent || saleData.service_fee_percent) || 0;
  const serviceFeeAmount = parseFloat(saleData.serviceFeeAmount || saleData.service_fee_amount) || 0;
  const isTakeaway = saleData.isTakeaway === 1 || saleData.isTakeaway === true || saleData.is_takeaway === 1;

  let serviceFeeHTML = '';
  if (!isTakeaway && serviceFeeAmount > 0) {
    serviceFeeHTML = `
      <div class="total-row" style="font-weight: normal; font-size: 11px; margin-bottom: 4px;">
        <span>${labels.usluga || 'Xizmat haqi'} (${serviceFeePercent}%):</span>
        <span>+${formatNumber(serviceFeeAmount)} so'm</span>
      </div>
    `;
  }

  let totalsHTML = `
    ${serviceFeeHTML}
    <div class="total-row">
      <span>${labels.jami}</span>
      <span>${formatNumber(total)} so'm</span>
    </div>
  `;

  if (overallDiscountAmount > 0) {
    totalsHTML = `
      <div class="total-row" style="font-weight: normal; font-size: 11px; margin-bottom: 2px;">
        <span>${labels.savdoSummasi}</span>
        <span>${formatNumber(totalOriginalAll)} so'm</span>
      </div>
      <div class="total-row" style="font-weight: normal; font-size: 11px; margin-bottom: 4px;">
        <span>${labels.chegirma} ${overallDiscountPercent > 0 ? `(${overallDiscountPercent}%)` : ''}:</span>
        <span>-${formatNumber(overallDiscountAmount)} so'm</span>
      </div>
      ${serviceFeeHTML}
      <div class="total-row">
        <span>${labels.jami}</span>
        <span>${formatNumber(total)} so'm</span>
      </div>
    `;
  }

  const formatDisplayDateTime = (dateInput) => {
    try {
      if (!dateInput) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      if (typeof dateInput === 'string') {
        const match = dateInput.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
        if (match) {
          const [, y, m, d, h, min] = match;
          return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        }
      }
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  };

  const displayDateTime = formatDisplayDateTime(date);

  let paymentMethodLabel = labels.naqd;
  if (paymentMethod === 'card') paymentMethodLabel = labels.card;
  if (paymentMethod === 'debt') paymentMethodLabel = labels.debt;

  const itemsHTML = cartItems.map((item, index) => {
    const itemPct = parseFloat(item.discount || item.discount_percent) || 0;
    const itemTotalOriginal = item.qty * item.sell_price;
    const itemDiscAmount = Math.round(itemTotalOriginal * (itemPct / 100));
    const itemTotalFinal = itemTotalOriginal - itemDiscAmount;

    return `
      <div class="item" style="margin-bottom: 6px; display: block; font-size: 12px;">
        <div style="font-weight: bold; word-break: break-all; line-height: 1.2;">
          ${index + 1}. ${item.name}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #000; margin-top: 2px; padding-left: 12px;">
          <span>${item.qty} ${item.unit || 'dona'} x ${formatNumber(item.sell_price)} so'm</span>
          <span style="font-weight: bold;">${formatNumber(itemTotalFinal)} so'm</span>
        </div>
        ${itemPct > 0 ? `
          <div style="font-size: 10px; font-style: italic; padding-left: 12px; color: #555;">
            (${labels.chegirma}: -${itemPct}%)
          </div>
        ` : ''}
        <div style="border-bottom: 1px dashed #000; margin: 6px 0 6px 0;"></div>
      </div>
    `;
  }).join('');

  let shopLogo = logoBase64;
  let printerWidth = '58';
  let shopPhone = '';
  let shopLocation = '';
  let telegramQr = '';
  let instagramQr = '';
  try {
    const customReceiptLogo = localStorage.getItem('receiptLogoBase64');
    const customLogo = localStorage.getItem('shopLogoBase64');
    if (customReceiptLogo) {
      shopLogo = customReceiptLogo;
    } else if (customLogo) {
      shopLogo = customLogo;
    }
    printerWidth = localStorage.getItem('printer_width') || '58';
    shopPhone = localStorage.getItem('shopPhone') || '';
    shopLocation = localStorage.getItem('shopLocation') || '';
    telegramQr = localStorage.getItem('telegramQrCode') || '';
    instagramQr = localStorage.getItem('instagramQrCode') || '';
  } catch(e) {}

  const headerPhoneList = contactPhones ? [contactPhones.phone_1, contactPhones.phone_2, contactPhones.phone_3].filter(p => p && p.trim() !== '') : [];
  let headerPhonesHTML = '';
  if (headerPhoneList.length > 0) {
    headerPhonesHTML = `
      <div class="receipt-phone-container">
        <span class="receipt-phone-label">${labels.murojaat}</span>
        ${headerPhoneList.map(p => `<span class="receipt-phone-val">${p}</span>`).join('')}
      </div>
    `;
  }

  const isKatta = printerWidth === '80';
  const htmlWidth = isKatta ? '80mm' : '58mm';
  const fontSize = isKatta ? '14px' : '12px';

  return `
    <!DOCTYPE html>
    <html lang="${receiptLang}">
    <head>
      <meta charset="UTF-8">
      <title>Chek #${saleData.shiftReceiptNumber || saleData.shift_receipt_number || saleId}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          height: max-content;
          overflow: hidden;
          background: white;
          font-family: sans-serif;
          font-size: ${fontSize};
          line-height: 1.2;
          color: #000;
          width: ${htmlWidth};
          overflow: hidden;
        }
        .receipt {
          width: 100%;
          padding-bottom: 2px;
        }
        .header {
          text-align: center;
          margin-bottom: 5px;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        .header h2 {
          font-size: 18px;
          margin-bottom: 2px;
          font-weight: bold;
        }
        .header p {
          font-size: 10px;
        }
        .divider {
          border-bottom: 1px dashed #000;
          margin: 5px 0;
        }
        .info {
          margin-bottom: 5px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
        }
        .items {
          margin: 10px 0;
        }
        .item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .item-name {
          flex: 1;
          word-break: break-all;
          padding-right: 5px;
        }
        .item-total {
          white-space: nowrap;
          text-align: right;
        }
        .totals {
          margin-top: 5px;
          padding-top: 5px;
          border-top: 1px solid #000;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          font-size: 12px;
        }
        .footer {
          text-align: center;
          margin-top: 15px;
          font-size: 10px;
        }
        .disclaimer {
          margin-top: 10px;
          padding-top: 7px;
          padding-bottom: 4px;
          border-top: 1px dashed #888;
          text-align: center;
          font-size: 9px;
          line-height: 1.4;
          color: #555;
        }
        .receipt-phone-container {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: center;
          gap: 6px;
          font-size: 15px;
          font-weight: bold;
          margin-top: 4px;
          margin-bottom: 2px;
          text-align: center;
          width: 100%;
        }
        .receipt-phone-label, .receipt-phone-val {
          white-space: nowrap;
        }
        .receipt-location {
          display: block;
          font-size: 12px;
          text-align: center;
          color: #333;
          margin-bottom: 6px;
        }
        .receipt-divider {
          border: none;
          border-top: 1px dashed #000;
          margin: 8px 0;
        }
        .receipt-social-qr-container {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          gap: 20px;
          margin-top: 10px;
          margin-bottom: 10px;
          width: 100%;
        }
        .receipt-social-qr-container .qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 45mm;
        }
        .receipt-social-qr-container .qr-box img {
          width: 35mm;
          height: 35mm;
          object-fit: contain;
        }
        .receipt-social-qr-container .qr-box span {
          font-size: 10px;
          font-weight: bold;
          margin-top: 2px;
        }
        @media print {
          html, body {
            width: ${htmlWidth};
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          #printable-receipt {
            display: block !important;
            position: static !important; 
            width: ${isKatta ? '78mm' : '56mm'};
            margin: 0 !important;
            margin-top: 0 !important;
            padding: 0 !important;
            padding-top: 0 !important;
            font-family: 'Courier New', Courier, monospace;
            font-size: ${fontSize};
            color: #000;
          }
          #printable-receipt .receipt-phone-container {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            align-items: center !important;
            gap: 6px !important;
            font-size: 15px !important;
            font-weight: bold !important;
            margin-top: 4px !important;
            margin-bottom: 2px !important;
            text-align: center !important;
            width: 100% !important;
          }
          #printable-receipt .receipt-phone-label, #printable-receipt .receipt-phone-val {
            white-space: nowrap !important;
          }
          #printable-receipt .receipt-location {
            display: block !important;
            font-size: 12px !important;
            text-align: center !important;
            color: #333 !important;
            margin-bottom: 6px !important;
          }
          #printable-receipt .receipt-divider {
            border: none !important;
            border-top: 1px dashed #000 !important;
            margin: 8px 0 !important;
          }
          .receipt-social-qr-container {
            display: flex !important;
            flex-direction: row !important;
            justify-content: center !important;
            align-items: center !important;
            gap: 20px !important;
            margin-top: 10px !important;
            margin-bottom: 10px !important;
            width: 100% !important;
          }
          .receipt-social-qr-container .qr-box {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: 45mm !important;
          }
          .receipt-social-qr-container .qr-box img {
            width: 35mm !important;
            height: 35mm !important;
            object-fit: contain !important;
          }
          .receipt-social-qr-container .qr-box span {
            font-size: 10px !important;
            font-weight: bold !important;
            margin-top: 2px !important;
          }
          @page {
            margin: 0 !important;
            width: ${htmlWidth};
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt" id="printable-receipt">
        <div class="header">
          <img src="${shopLogo}" alt="Logo" style="width: 200px; height: auto; display: block; margin: 0 auto 3px auto;" />
          ${storeName ? `<h2 style="font-size: 16px; font-weight: bold; margin: 5px 0; text-transform: uppercase; text-align: center;">${storeName}</h2>` : ''}
          ${headerPhonesHTML}
          ${shopLocation ? `<span class="receipt-location">${labels.manzil} ${shopLocation}</span>` : ''}
          <hr class="receipt-divider" />
          ${isReprint ? `<p style="margin-top: 5px; font-weight: bold; border: 1px dashed #000; padding: 2px; text-align: center; font-size: 10px;">${labels.qaytaChek}</p>` : ''}
        </div>
        
        <div class="info">
          <div class="info-row">
            <span>${labels.chekN}</span>
            <span>${saleData.shiftReceiptNumber || saleData.shift_receipt_number || saleData.dailyReceiptNumber || saleId}</span>
          </div>
          <div class="info-row">
            <span>${labels.sana}</span>
            <span>${displayDateTime}</span>
          </div>
          <div class="info-row">
            <span>${labels.kassir}</span>
            <span>${cashierName || 'Kassir'}</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="items">
          ${itemsHTML}
        </div>

        <div class="totals">
          ${totalsHTML}
          <div class="total-row" style="font-weight: normal; margin-top: 2px;">
            <span>${labels.tolovTuri}</span>
            <span>${paymentMethodLabel}</span>
          </div>
        </div>

        ${(telegramQr || instagramQr) ? `
        <div class="receipt-social-qr-container">
          ${telegramQr ? `<div class="qr-box"><img src="${telegramQr}" alt="TG" /><span>Telegram</span></div>` : ''}
          ${instagramQr ? `<div class="qr-box"><img src="${instagramQr}" alt="IG" /><span>Instagram</span></div>` : ''}
        </div>
        ` : ''}

        ${comment && comment.trim() ? `
        <div style="border-top: 1px dashed #000; margin-top: 6px; padding-top: 6px; text-align: left;">
          <div style="font-size: 11px; font-weight: bold; margin-bottom: 2px;">${labels.izoh}</div>
          <div style="font-size: 11px; word-break: break-all; white-space: pre-wrap;">${comment}</div>
        </div>
        ` : ''}

        <div class="footer">
          <p>${labels.rahmat}</p>
        </div>

        <div class="disclaimer">
          ${labels.disclaimer}
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateZReportHTML({ stats, storeName, cashierName }) {
  let openedAtStr = "Noma'lum";
  if (stats.opened_at) {
    const openedDateObj = parseSQLiteDate(stats.opened_at);
    openedAtStr = `${openedDateObj.toLocaleDateString('ru-RU')} ${openedDateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const dateObj = new Date();
  const formattedDate = dateObj.toLocaleDateString('ru-RU');
  const formattedTime = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const closedAtStr = `${formattedDate} ${formattedTime}`;

  const formatNumber = (num) => {
    return Number(num).toLocaleString('ru-RU');
  };

  const receiptLang = (typeof localStorage !== 'undefined' ? localStorage.getItem('receipt_lang') : null) || 'uz';
  const zLabels = zReportTranslations[receiptLang] || zReportTranslations.uz;

  let shopLogo = logoBase64;
  let printerWidth = '58';
  try {
    const customReceiptLogo = localStorage.getItem('receiptLogoBase64');
    const customLogo = localStorage.getItem('shopLogoBase64');
    if (customReceiptLogo) {
      shopLogo = customReceiptLogo;
    } else if (customLogo) {
      shopLogo = customLogo;
    }
    printerWidth = localStorage.getItem('printer_width') || '58';
  } catch(e) {}

  const isKatta = printerWidth === '80';
  const htmlWidth = isKatta ? '80mm' : '58mm';
  const fontSize = isKatta ? '14px' : '12px';

  return `
    <!DOCTYPE html>
    <html lang="${receiptLang}">
    <head>
      <meta charset="UTF-8">
      <title>${zLabels.zReport}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          height: max-content;
          background: white;
          font-family: sans-serif;
          font-size: ${fontSize};
          line-height: 1.2;
          color: #000;
          width: ${htmlWidth};
        }
        .receipt {
          width: 100%;
          padding-bottom: 10px;
        }
        .header {
          text-align: center;
          margin-bottom: 10px;
        }
        .header h2 {
          margin-bottom: 2px;
          font-size: ${isKatta ? '16px' : '14px'};
        }
        .info {
          margin-bottom: 10px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .divider {
          border-top: 1px dashed #000;
          margin: 10px 0;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          font-size: 13px;
          margin-bottom: 4px;
        }
        .sub-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .footer {
          text-align: center;
          margin-top: 15px;
          font-size: 10px;
        }
        @media print {
          html, body {
            width: ${htmlWidth};
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          #printable-receipt {
            display: block !important;
            position: static !important; 
            width: ${isKatta ? '78mm' : '56mm'};
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'Courier New', Courier, monospace;
            font-size: ${fontSize};
            color: #000;
          }
          @page {
            margin: 0 !important;
            width: ${htmlWidth};
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt" id="printable-receipt">
        <div class="header">
          <img src="${shopLogo}" alt="Logo" style="width: 200px; height: auto; display: block; margin: 10px auto 10px auto;" />
          <h2>${storeName || "Do'kon"}</h2>
          <p style="font-weight: bold; font-size: 14px; margin-top: 5px;">${zLabels.zReport} ${stats.shift_number ? `№${stats.shift_number}` : ''}</p>
          <p>${zLabels.shiftClose}</p>
        </div>
        
        <div class="info">
          <div class="info-row">
            <span>${zLabels.openedAt}</span>
            <span>${openedAtStr}</span>
          </div>
          <div class="info-row">
            <span>${zLabels.closedAt}</span>
            <span>${closedAtStr}</span>
          </div>
          <div class="info-row">
            <span>${zLabels.openedBy}</span>
            <span>${stats.opened_by || cashierName}</span>
          </div>
          <div class="info-row">
            <span>${zLabels.closedBy}</span>
            <span>${stats.closed_by || cashierName}</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="total-row">
          <span>${zLabels.jamiSavdo}</span>
          <span>${formatNumber(stats.total_sales)} so'm</span>
        </div>
        
        <div class="divider"></div>

        <div class="sub-row">
          <span>${zLabels.naqd}</span>
          <span>${formatNumber(stats.cash_sales)} so'm</span>
        </div>
        <div class="sub-row">
          <span>${zLabels.card}</span>
          <span>${formatNumber(stats.card_sales)} so'm</span>
        </div>
        <div class="sub-row">
          <span>${zLabels.debt}</span>
          <span>${formatNumber(stats.debt_sales)} so'm</span>
        </div>
        
        ${stats.total_discounts > 0 ? `
        <div class="sub-row">
          <span>${zLabels.chegirmalar}</span>
          <span>-${formatNumber(stats.total_discounts)} so'm</span>
        </div>
        ` : ''}

        ${stats.total_refunds > 0 ? `
        <div class="sub-row">
          <span>${zLabels.vozvrat} (${stats.refunds_count} ta):</span>
          <span>-${formatNumber(stats.total_refunds)} so'm</span>
        </div>
        ` : ''}

        ${stats.total_expenses > 0 ? `
        <div class="divider"></div>
        <div class="sub-row" style="color: #000; font-weight: bold;">
          <span>${zLabels.rashod}</span>
          <span>-${formatNumber(stats.total_expenses)} so'm</span>
        </div>
        ` : ''}

        <div class="divider"></div>

        <div class="total-row">
          <span>${zLabels.kassadagiNaqd}</span>
          <span>${formatNumber(stats.expected_cash)} so'm</span>
        </div>

        <div class="divider"></div>
        
        <div class="sub-row">
          <span>${zLabels.cheklarSoni}</span>
          <span>${stats.receipts_count} ta</span>
        </div>

        <div class="footer">
          <p>${zLabels.rahmat}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
