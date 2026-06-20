const ExcelJS = require('exceljs');

function generateA4InvoiceHTML(shopInfo, saleDetails) {
  const dateObj = (saleDetails.date || saleDetails.created_at) ? new Date(saleDetails.date || saleDetails.created_at) : new Date();
  const formattedDate = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // Totals calculations
  const totalAmount = parseFloat(saleDetails.total || saleDetails.total_amount || 0);
  const discountAmount = parseFloat(saleDetails.discountAmount || saleDetails.discount_amount || 0);
  const paymentMethod = saleDetails.paymentMethod || saleDetails.payment_method || 'cash';
  
  // Paid amount calculation
  const paid = paymentMethod === 'debt' 
    ? parseFloat(saleDetails.paidAmount !== undefined ? saleDetails.paidAmount : 0) 
    : totalAmount;
  
  // Debt calculation
  const debt = paymentMethod === 'debt'
    ? parseFloat(saleDetails.debtAmount !== undefined ? saleDetails.debtAmount : (saleDetails.customerTotalDebt !== undefined ? saleDetails.customerTotalDebt : (saleDetails.customerInfo?.total_debt !== undefined ? saleDetails.customerInfo.total_debt : totalAmount - paid)))
    : 0;

  const itemsHTML = (saleDetails.cartItems || saleDetails.items || []).map((item, index) => {
    const qty = parseFloat(item.qty || item.quantity || 0);
    const price = parseFloat(item.price || item.sell_price || 0);
    const itemTotal = qty * price;
    return `
      <tr>
        <td style="text-align: center; border: 1px solid #000; padding: 6px;">${index + 1}</td>
        <td style="border: 1px solid #000; padding: 6px;">${item.name || item.product_name}</td>
        <td style="text-align: right; border: 1px solid #000; padding: 6px;">${qty} ${item.unit || 'dona'}</td>
        <td style="text-align: right; border: 1px solid #000; padding: 6px;">${Math.round(price).toLocaleString('ru-RU')} so'm</td>
        <td style="text-align: right; border: 1px solid #000; padding: 6px; font-weight: bold;">${Math.round(itemTotal).toLocaleString('ru-RU')} so'm</td>
      </tr>
    `;
  }).join('');

  const customerName = saleDetails.customerName || saleDetails.customerInfo?.name || 'Aholi';
  const customerPhone = saleDetails.customerPhone || saleDetails.customerInfo?.phone || '-';
  const paymentMethodLabel = paymentMethod === 'cash' ? 'Naqd' : paymentMethod === 'card' ? 'Karta' : 'Qarz (Nasiya)';

  return `
    <!DOCTYPE html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Xarid Cheki</title>
      <style>
        body { font-family: 'Arial', sans-serif; margin: 40px; color: #000; font-size: 13px; line-height: 1.4; }
        .invoice-box { max-width: 800px; margin: auto; padding: 25px; border: 1px dashed #aaa; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .org-title { font-size: 20px; font-weight: bold; text-transform: uppercase; }
        .info-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .info-table td { padding: 4px 0; vertical-align: top; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .items-table th { border: 1px solid #000; background-color: #f0f0f0; padding: 8px; font-weight: bold; }
        .totals-container { width: 100%; display: flex; justify-content: flex-end; }
        .totals-table { width: 320px; border-collapse: collapse; margin-top: 10px; }
        .totals-table td { padding: 6px; border: 1px solid #000; }
        .totals-table td.label { font-weight: bold; background-color: #fafafa; }
        .footer { text-align: center; margin-top: 40px; font-size: 11px; border-top: 1px solid #000; padding-top: 15px; color: #555; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <table class="header-table">
          <tr>
            <td>
              <div class="org-title">${shopInfo.magazin_nomi || 'Tashkilot'}</div>
              <div style="margin-top: 5px; font-weight: bold; color: #444;">Tel: ${shopInfo.magazin_tel || 'Kiritilmagan'}</div>
            </td>
            <td style="text-align: right; vertical-align: bottom;">
              <div style="font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">HISOB-FAKTURA (A4)</div>
              <div style="margin-top: 5px;">Hujjat №: <strong>${saleDetails.shiftReceiptNumber || saleDetails.shift_receipt_number || saleDetails.id || ''}</strong></div>
              <div>Sana: <strong>${formattedDate} ${formattedTime}</strong></div>
            </td>
          </tr>
        </table>

        <hr style="border: 0; border-top: 2px solid #000; margin-bottom: 20px;" />

        <table class="info-table">
          <tr>
            <td style="width: 50%;">
              <strong>SOTUVCHI:</strong><br>
              Tashkilot: ${shopInfo.magazin_nomi || 'POS Tizim'}<br>
              Telefon: ${shopInfo.magazin_tel || '-'}<br>
              Kassir: ${saleDetails.cashierName || saleDetails.cashier_name || 'Kassir'}
            </td>
            <td style="width: 50%; padding-left: 20px;">
              <strong>XARIDOR (MIJOZ):</strong><br>
              Ismi: ${customerName}<br>
              Telefon: ${customerPhone}<br>
              To'lov Turi: ${paymentMethodLabel}
            </td>
          </tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="text-align: left;">Mahsulot nomi</th>
              <th style="width: 15%; text-align: right;">Soni</th>
              <th style="width: 20%; text-align: right;">Narxi (1 dona)</th>
              <th style="width: 25%; text-align: right;">Jami summa</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals-container">
          <table class="totals-table">
            ${discountAmount > 0 ? `
              <tr>
                <td class="label">Chegirma:</td>
                <td style="text-align: right; font-weight: bold; color: #ef4444;">-${Math.round(discountAmount).toLocaleString('ru-RU')} so'm</td>
              </tr>
            ` : ''}
            <tr>
              <td class="label">Jami summa:</td>
              <td style="text-align: right; font-weight: bold; font-size: 14px;">${Math.round(totalAmount).toLocaleString('ru-RU')} so'm</td>
            </tr>
            <tr>
              <td class="label">To'landi (Naqd pul):</td>
              <td style="text-align: right; font-weight: bold; color: #10b981;">${Math.round(paid).toLocaleString('ru-RU')} so'm</td>
            </tr>
            <tr>
              <td class="label" style="color: #ef4444;">Qolgan qarz:</td>
              <td style="text-align: right; font-weight: bold; color: #ef4444; font-size: 14px;">${Math.round(debt).toLocaleString('ru-RU')} so'm</td>
            </tr>
          </table>
        </div>

        <div class="footer">
          Savdo va xizmatlar uchun minnatdormiz!<br>
          Hujjat xxMpos elektron POS dasturi orqali avtomatlashtirilgan holda chop etildi.
        </div>
      </div>
    </body>
    </html>
  `;
}

async function generateExcelInvoice(shopInfo, saleDetails, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Naxladnoy');

  // Configure column widths
  worksheet.columns = [
    { header: '№', key: 'index', width: 8 },
    { header: 'Mahsulot nomi', key: 'name', width: 45 },
    { header: 'Soni', key: 'qty', width: 15 },
    { header: 'Narxi (1 dona)', key: 'price', width: 22 },
    { header: 'Jami Summa', key: 'total', width: 26 }
  ];

  // 1. Organization Header block
  worksheet.mergeCells('A1:E1');
  const orgCell = worksheet.getCell('A1');
  orgCell.value = shopInfo.magazin_nomi || 'Tashkilot';
  orgCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
  orgCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F497D' }
  };
  orgCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 35;

  worksheet.mergeCells('A2:E2');
  const phoneCell = worksheet.getCell('A2');
  phoneCell.value = `Kontaktlar: ${shopInfo.magazin_tel || 'Kiritilmagan'}`;
  phoneCell.font = { name: 'Arial', size: 10, italic: true };
  phoneCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 18;

  // 2. Invoice Meta data
  const shiftReceiptNumber = saleDetails.shiftReceiptNumber || saleDetails.shift_receipt_number || saleDetails.id || '';
  const dateStr = saleDetails.date || saleDetails.created_at || Date.now();
  const paymentMethod = saleDetails.paymentMethod || saleDetails.payment_method || 'cash';
  const totalAmount = parseFloat(saleDetails.total || saleDetails.total_amount || 0);
  const discountAmount = parseFloat(saleDetails.discountAmount || saleDetails.discount_amount || 0);

  worksheet.getCell('A4').value = 'Hujjat №:';
  worksheet.getCell('A4').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('B4').value = shiftReceiptNumber;
  worksheet.getCell('B4').font = { name: 'Arial', size: 10, bold: true };

  worksheet.getCell('D4').value = 'Sana:';
  worksheet.getCell('D4').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('E4').value = new Date(dateStr).toLocaleDateString('ru-RU');
  worksheet.getCell('E4').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('E4').alignment = { horizontal: 'right' };

  const customerName = saleDetails.customerName || saleDetails.customerInfo?.name || 'Aholi';
  const customerPhone = saleDetails.customerPhone || saleDetails.customerInfo?.phone || '';
  const customerFull = `${customerName} ${customerPhone}`.trim();

  worksheet.getCell('A5').value = 'Xaridor:';
  worksheet.getCell('A5').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('B5').value = customerFull;
  worksheet.getCell('B5').font = { name: 'Arial', size: 10, bold: true };

  worksheet.getCell('D5').value = "To'lov turi:";
  worksheet.getCell('D5').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('E5').value = paymentMethod === 'cash' ? 'Naqd' : paymentMethod === 'card' ? 'Karta' : 'Qarz';
  worksheet.getCell('E5').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('E5').alignment = { horizontal: 'right' };

  // 3. Table Headers
  const headerRowNumber = 7;
  const headers = ['№', 'Mahsulot nomi', 'Soni', 'Narxi (1 dona)', 'Jami Summa'];
  worksheet.getRow(headerRowNumber).values = headers;
  worksheet.getRow(headerRowNumber).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(headerRowNumber).height = 24;
  
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '366092' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  });

  const thinBorder = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  // 4. Fill Items loop
  let currentRow = 8;
  const cartItems = saleDetails.cartItems || saleDetails.items || [];
  cartItems.forEach((item, index) => {
    const qty = parseFloat(item.qty || item.quantity || 0);
    const price = parseFloat(item.price || item.sell_price || 0);

    worksheet.getCell(`A${currentRow}`).value = index + 1;
    worksheet.getCell(`B${currentRow}`).value = item.name || item.product_name;
    worksheet.getCell(`C${currentRow}`).value = qty;
    worksheet.getCell(`D${currentRow}`).value = price;

    // Excel formula: Quantity * Price
    worksheet.getCell(`E${currentRow}`).value = { formula: `C${currentRow}*D${currentRow}` };

    // Font styles
    worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10 };
    worksheet.getCell(`B${currentRow}`).font = { name: 'Arial', size: 10 };
    worksheet.getCell(`C${currentRow}`).font = { name: 'Arial', size: 10 };
    worksheet.getCell(`D${currentRow}`).font = { name: 'Arial', size: 10 };
    worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 10, bold: true };

    // Formats and Alignments
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell(`B${currentRow}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    worksheet.getCell(`D${currentRow}`).numFmt = '#,##0" so\'m"';
    worksheet.getCell(`E${currentRow}`).numFmt = '#,##0" so\'m"';

    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      worksheet.getCell(`${col}${currentRow}`).border = thinBorder;
    });

    currentRow++;
  });

  // 5. Totals section
  currentRow += 2; // leave one spacing row
  const startItemsRow = 8;
  const endItemsRow = currentRow - 3;

  // Jami summa formula
  worksheet.getCell(`C${currentRow}`).value = 'Jami summa:';
  worksheet.getCell(`C${currentRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`E${currentRow}`).value = { formula: `SUM(E${startItemsRow}:E${endItemsRow})` };
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).numFmt = '#,##0" so\'m"';
  currentRow++;

  // Naqd pul (Paid amount)
  const paid = paymentMethod === 'debt' 
    ? parseFloat(saleDetails.paidAmount !== undefined ? saleDetails.paidAmount : 0) 
    : totalAmount;
  
  worksheet.getCell(`C${currentRow}`).value = "To'landi (Naqd pul):";
  worksheet.getCell(`C${currentRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`E${currentRow}`).value = paid;
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: '008000' } };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).numFmt = '#,##0" so\'m"';
  currentRow++;

  // Qolgan qarz (Debt amount)
  const debt = paymentMethod === 'debt'
    ? parseFloat(saleDetails.debtAmount !== undefined ? saleDetails.debtAmount : (saleDetails.customerTotalDebt !== undefined ? saleDetails.customerTotalDebt : (saleDetails.customerInfo?.total_debt !== undefined ? saleDetails.customerInfo.total_debt : totalAmount - paid)))
    : 0;

  worksheet.getCell(`C${currentRow}`).value = 'Qolgan qarz:';
  worksheet.getCell(`C${currentRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`E${currentRow}`).value = debt;
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0000' } };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).numFmt = '#,##0" so\'m"';

  // Apply borders to totals table
  const totalsRows = [currentRow - 2, currentRow - 1, currentRow];
  totalsRows.forEach(row => {
    worksheet.getCell(`C${row}`).border = thinBorder;
    worksheet.getCell(`D${row}`).border = thinBorder;
    worksheet.getCell(`E${row}`).border = thinBorder;
    worksheet.mergeCells(`C${row}:D${row}`);
  });

  // 6. Signatures block
  currentRow += 3;
  
  // Topshirdi (topshiruvchi)
  worksheet.getCell(`A${currentRow}`).value = 'Topshirdi: ________________________';
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  
  // Qabul qildi (qabul qiluvchi)
  worksheet.getCell(`D${currentRow}`).value = 'Qabul qildi: ________________________';
  worksheet.getCell(`D${currentRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`D${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };
  worksheet.mergeCells(`D${currentRow}:E${currentRow}`);

  // Write file
  await workbook.xlsx.writeFile(outputPath);
}

module.exports = {
  generateA4InvoiceHTML,
  generateExcelInvoice
};
