import { forwardRef, useState, useEffect } from 'react';
import { logoBase64 } from '../logoBase64';
import { useApp } from '../context/AppContext';

const receiptTranslations = {
  uz: {
    murojaat: "Murojaat uchun:",
    manzil: "Manzil:",
    qaytaChek: "Qayta chiqarilgan chek",
    stolHisobi: "STOL HISOBI (PRE-CHEK)",
    chekN: "Chek N:",
    sana: "Sana:",
    kassir: "Kassir:",
    jami: "JAMI:",
    savdoSummasi: "Savdo summasi:",
    chegirma: "Chegirma",
    tolovTuri: "To'lov turi:",
    izoh: "Izoh:",
    rahmat: "Xaridingiz uchun rahmat!",
    disclaimer: "Ushbu chek ichki hisob-kitob uchun.<br />Fiskal (soliq) cheki hisoblanmaydi!<br />Iltimos, kassirdan rasmiy fiskal chek talab qiling.",
    naqd: "Naqd pul",
    card: "Plastik karta",
    debt: "Qarzga",
    usluga: "Xizmat haqi"
  },
  ru: {
    murojaat: "Для справок:",
    manzil: "Адрес:",
    qaytaChek: "Повторно распечатанный чек",
    stolHisobi: "СЧЕТ СТОЛА (ПРЕ-ЧЕК)",
    chekN: "Чек №:",
    sana: "Дата:",
    kassir: "Кассир:",
    jami: "ИТОГО:",
    savdoSummasi: "Сумма продажи:",
    chegirma: "Скидка",
    tolovTuri: "Тип оплаты:",
    izoh: "Примечание:",
    rahmat: "Спасибо за покупку!",
    disclaimer: "Этот чек предназначен для внутреннего учета.<br />Не является фискальным чеком!<br />Пожалуйста, требуйте официальный фискальный чек у кассира.",
    naqd: "Наличные",
    card: "Пластиковая карта",
    debt: "В долг",
    usluga: "Обслуживание"
  }
};

export const PrintableReceipt = forwardRef(({ saleData, storeName, cashierName, isReprint = false }, ref) => {
  const { shopLogo, businessType } = useApp();
  const [phones, setPhones] = useState({ phone_1: '', phone_2: '', phone_3: '' });
  const [receiptLang, setReceiptLang] = useState('uz');

  useEffect(() => {
    const fetchSettings = async () => {
      if (window.api) {
        try {
          const res = await window.api.getSettings();
          if (res && res.success && res.data) {
            setPhones({
              phone_1: res.data.phone_1 || '',
              phone_2: res.data.phone_2 || '',
              phone_3: res.data.phone_3 || '',
            });
            if (res.data.receipt_lang) {
              setReceiptLang(res.data.receipt_lang);
              localStorage.setItem('receipt_lang', res.data.receipt_lang);
            }
          }
        } catch (err) {
        }
      }
    };
    fetchSettings();
  }, [saleData]);

  if (!saleData) return null;

  const { cartItems = [], total = 0, paymentMethod, saleId, date, dailyReceiptNumber, shiftReceiptNumber, isPreCheck, comment } = saleData;
  const serviceFeePercent = parseFloat(saleData.serviceFeePercent || saleData.service_fee_percent) || 0;
  const serviceFeeAmount = parseFloat(saleData.serviceFeeAmount || saleData.service_fee_amount) || 0;
  const isTakeaway = saleData.isTakeaway === 1 || saleData.isTakeaway === true || saleData.is_takeaway === 1;

  const totalOriginalAll = cartItems.reduce((sum, item) => {
    return sum + (item.qty * item.sell_price);
  }, 0);

  const overallDiscountAmount = totalOriginalAll - total;
  const overallDiscountPercent = totalOriginalAll > 0 ? Math.round((overallDiscountAmount / totalOriginalAll) * 100) : 0;

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

  const formatNumber = (num) => {
    return Number(num).toLocaleString('ru-RU');
  };

  const activeLang = localStorage.getItem('receipt_lang') || receiptLang || 'uz';
  const labels = receiptTranslations[activeLang] || receiptTranslations.uz;

  let paymentMethodLabel = labels.naqd;
  if (paymentMethod === 'card') paymentMethodLabel = labels.card;
  if (paymentMethod === 'debt') paymentMethodLabel = labels.debt;

  const isKatta = localStorage.getItem('printer_width') === '80';
  const receiptWidth = isKatta ? '100%' : '280px';
  const receiptMaxWidth = isKatta ? '80mm' : 'auto';
  const receiptFontSize = isKatta ? '14px' : '12px';

  return (
    <div 
      ref={ref} 
      style={{
        width: receiptWidth,
        maxWidth: receiptMaxWidth,
        margin: '0',
        padding: '0 10px 10px 10px',
        backgroundColor: 'white',
        color: '#000000',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif, monospace",
        fontWeight: '700',
        fontSize: receiptFontSize,
        lineHeight: '1.2',
        textAlign: 'left',
        boxSizing: 'border-box',
        display: 'block'
      }}
      id="printable-receipt"
    >
      <div style={{ textAlign: 'center', marginBottom: '5px', marginTop: '0', paddingTop: '0' }}>
        {/* Hide shop logo on pre-check */}
        {!isPreCheck && (shopLogo || logoBase64) && (
          <img src={shopLogo || logoBase64} alt="Logo" style={{ width: '200px', height: 'auto', display: 'block', margin: '0 auto 3px auto' }} />
        )}
        
        {storeName && (
          <h2 style={{ fontSize: isKatta ? '18px' : '16px', fontWeight: 'bold', margin: '5px 0', textTransform: 'uppercase', color: '#000000', textAlign: 'center' }}>
            {storeName}
          </h2>
        )}
        
        {(() => {
          const phoneList = [phones.phone_1, phones.phone_2, phones.phone_3].filter(p => p && p.trim() !== '');
          if (phoneList.length === 0) return null;
          return (
            <div className="receipt-phone-container" style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '6px',
              fontSize: isKatta ? '16px' : '15px',
              fontWeight: 'bold',
              marginTop: '4px',
              marginBottom: '2px',
              textAlign: 'center',
              width: '100%'
            }}>
              <span className="receipt-phone-label" style={{ whiteSpace: 'nowrap' }}>{labels.murojaat}</span>
              {phoneList.map((p, idx) => (
                <span key={idx} className="receipt-phone-val" style={{ whiteSpace: 'nowrap' }}>{p}</span>
              ))}
            </div>
          );
        })()}
        {localStorage.getItem('shopLocation') && (
          <span className="receipt-location" style={{ display: 'block', fontSize: isKatta ? '13px' : '12px', color: '#333', marginBottom: '6px', textAlign: 'center' }}>
            {labels.manzil} {localStorage.getItem('shopLocation')}
          </span>
        )}
        <hr className="receipt-divider" style={{ border: 'none', borderTop: '1px dashed #000', margin: '8px 0' }} />
        {isReprint && (
          <p style={{ marginTop: '5px', fontWeight: 'bold', border: '1px dashed #000', padding: '2px', fontSize: '10px', textAlign: 'center' }}>
            {labels.qaytaChek}
          </p>
        )}
        {isPreCheck && (
          <div style={{ textTransform: 'uppercase', textAlign: 'center', fontWeight: '900', border: '2px solid #000', padding: '4px', fontSize: isKatta ? '14px' : '12px', margin: '5px 0' }}>
            {labels.stolHisobi}
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{labels.chekN}</span>
          <span>{shiftReceiptNumber || dailyReceiptNumber || saleId}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{labels.sana}</span>
          <span>{displayDateTime}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{labels.kassir}</span>
          <span>{cashierName || 'Kassir'}</span>
        </div>
      </div>

      <div style={{ borderBottom: '1px dashed #000', margin: '5px 0' }}></div>

      <div style={{ margin: '10px 0' }}>
        {(() => {
          const grouped = {};
          cartItems.forEach((item, index) => {
            const cat = item.category || 'Boshqa';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push({ ...item, originalIndex: index + 1 });
          });
          
          return Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginBottom: businessType === 'retail' ? '0px' : '10px' }}>
              {businessType !== 'retail' && (
                <div style={{
                  fontWeight: '900',
                  fontSize: isKatta ? '12px' : '11px',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid #000',
                  paddingBottom: '2px',
                  marginBottom: '5px',
                  color: '#000',
                  letterSpacing: '1px'
                }}>
                  -- {category} --
                </div>
              )}
              {items.map((item, idx) => {
                const itemPct = parseFloat(item.discount || item.discount_percent) || 0;
                const itemTotalOriginal = item.qty * item.sell_price;
                const itemDiscAmount = Math.round(itemTotalOriginal * (itemPct / 100));
                const itemTotalFinal = itemTotalOriginal - itemDiscAmount;

                return (
                  <div key={idx} style={{ marginBottom: '6px', display: 'block', fontSize: isKatta ? '13px' : '12px' }}>
                    <div style={{ fontWeight: 'bold', wordBreak: 'break-all', lineHeight: '1.2' }}>
                      {item.originalIndex}. {item.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: isKatta ? '12px' : '11px', color: '#000', marginTop: '2px', paddingLeft: '12px' }}>
                      <span>{item.qty} {item.unit || 'dona'} x {formatNumber(item.sell_price)} so'm</span>
                      <span style={{ fontWeight: 'bold' }}>{formatNumber(itemTotalFinal)} so'm</span>
                    </div>
                    {itemPct > 0 && (
                      <div style={{ fontSize: '10px', fontStyle: 'italic', paddingLeft: '12px', color: '#555' }}>
                        ({labels.chegirma}: -{itemPct}%)
                      </div>
                    )}
                    {businessType === 'retail' && (
                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0 6px 0' }}></div>
                    )}
                  </div>
                );
              })}
            </div>
          ));
        })()}
      </div>

      <div style={{ borderTop: '1px solid #000', marginTop: '5px', paddingTop: '5px' }}>
        {overallDiscountAmount > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', fontSize: isKatta ? '12px' : '11px', marginBottom: '2px' }}>
              <span>{labels.savdoSummasi}</span>
              <span>{formatNumber(totalOriginalAll)} so'm</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', fontSize: isKatta ? '12px' : '11px', marginBottom: '4px' }}>
              <span>{labels.chegirma} {overallDiscountPercent > 0 ? `(${overallDiscountPercent}%)` : ''}:</span>
              <span>-{formatNumber(overallDiscountAmount)} so'm</span>
            </div>
          </>
        )}
        {!isTakeaway && serviceFeeAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', fontSize: isKatta ? '12px' : '11px', marginBottom: '4px' }}>
            <span>{labels.usluga} ({serviceFeePercent}%):</span>
            <span>+{formatNumber(serviceFeeAmount)} so'm</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: isKatta ? '15px' : '13px' }}>
          <span>{labels.jami}</span>
          <span>{formatNumber(total)} so'm</span>
        </div>
        {!isPreCheck && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', marginTop: '2px' }}>
            <span>{labels.tolovTuri}</span>
            <span>{paymentMethodLabel}</span>
          </div>
        )}
      </div>
      
      {comment && (
        <div style={{ borderTop: '1px dashed #000', marginTop: '5px', paddingTop: '5px', fontSize: '10px', fontWeight: 'bold', wordBreak: 'break-all' }}>
          {labels.izoh} {comment}
        </div>
      )}

      {/* Render social media QR codes only if not precheck */}
      {!isPreCheck && (() => {
        const tgQr = localStorage.getItem('telegramQrCode');
        const igQr = localStorage.getItem('instagramQrCode');
        if (!tgQr && !igQr) return null;
        return (
          <div className="receipt-social-qr-container" style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            marginTop: '10px',
            marginBottom: '10px',
            width: '100%'
          }}>
            {tgQr && (
              <div className="qr-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '45mm' }}>
                <img src={tgQr} alt="TG" style={{ width: '35mm', height: '35mm', objectFit: 'contain' }} />
                <span style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '2px' }}>Telegram</span>
              </div>
            )}
            {igQr && (
              <div className="qr-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '45mm' }}>
                <img src={igQr} alt="IG" style={{ width: '35mm', height: '35mm', objectFit: 'contain' }} />
                <span style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '2px' }}>Instagram</span>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '10px' }}>
        <p style={{ margin: '0' }}>{labels.rahmat}</p>
      </div>

      <div 
        style={{
          marginTop: '10px',
          paddingTop: '7px',
          paddingBottom: '4px',
          borderTop: '1px dashed #888',
          textAlign: 'center',
          fontSize: '9px',
          lineHeight: '1.4',
          color: '#555'
        }}
        dangerouslySetInnerHTML={{ __html: labels.disclaimer }}
      />
    </div>
  );
});

PrintableReceipt.displayName = 'PrintableReceipt';
