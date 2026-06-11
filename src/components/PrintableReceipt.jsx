import { forwardRef, useState, useEffect } from 'react';
import { logoBase64 } from '../logoBase64';

export const PrintableReceipt = forwardRef(({ saleData, storeName, cashierName, isReprint = false }, ref) => {
  const [phones, setPhones] = useState({ phone_1: '', phone_2: '', phone_3: '' });

  useEffect(() => {
    const fetchPhones = async () => {
      if (window.api) {
        try {
          const res = await window.api.getSettings();
          if (res && res.success && res.data) {
            setPhones({
              phone_1: res.data.phone_1 || '',
              phone_2: res.data.phone_2 || '',
              phone_3: res.data.phone_3 || '',
            });
          }
        } catch (err) {
        }
      }
    };
    fetchPhones();
  }, [saleData]);

  if (!saleData) return null;

  const { cartItems = [], total = 0, paymentMethod, saleId, date, dailyReceiptNumber, shiftReceiptNumber } = saleData;

  const totalOriginalAll = cartItems.reduce((sum, item) => {
    return sum + (item.qty * item.sell_price);
  }, 0);

  const overallDiscountAmount = totalOriginalAll - total;
  const overallDiscountPercent = totalOriginalAll > 0 ? Math.round((overallDiscountAmount / totalOriginalAll) * 100) : 0;

  let dateObj = new Date();
  if (date) {
    const validDateStr = (date.includes('Z') || date.includes('T')) ? date : date.replace(' ', 'T') + 'Z';
    dateObj = new Date(validDateStr);
    if (isNaN(dateObj.getTime())) dateObj = new Date();
  }

  const formattedDate = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const displayDateTime = `${formattedDate} | ${formattedTime}`;

  const formatNumber = (num) => {
    return Number(num).toLocaleString('ru-RU');
  };

  let paymentMethodLabel = 'Naqd pul';
  if (paymentMethod === 'card') paymentMethodLabel = 'Plastik karta';
  if (paymentMethod === 'debt') paymentMethodLabel = 'Qarzga';

  return (
    <div 
      ref={ref} 
      style={{
        width: '280px',
        margin: '0', // Set margin to 0 to prevent cutting off the store name header
        padding: '0 10px 10px 10px', // Set top padding to 0 to eliminate top whitespace
        backgroundColor: 'white',
        color: '#000000',
        fontFamily: "'Courier New', Courier, monospace",
        fontWeight: '700',
        fontSize: '12px',
        lineHeight: '1.2',
        textAlign: 'left',
        boxSizing: 'border-box',
        display: 'block',
        letterSpacing: '0.5px',
        textRendering: 'crispEdges',
        WebkitFontSmoothing: 'none',
      }}
      id="printable-receipt"
    >
      <div style={{ textAlign: 'center', marginBottom: '5px', marginTop: '0', paddingTop: '0' }}>
        <img src={logoBase64} alt="Logo" style={{ width: '200px', height: 'auto', display: 'block', margin: '0 auto 3px auto' }} />
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
              fontSize: '15px',
              fontWeight: 'bold',
              marginTop: '4px',
              marginBottom: '2px',
              textAlign: 'center',
              width: '100%'
            }}>
              <span className="receipt-phone-label" style={{ whiteSpace: 'nowrap' }}>Murojaat uchun:</span>
              {phoneList.map((p, idx) => (
                <span key={idx} className="receipt-phone-val" style={{ whiteSpace: 'nowrap' }}>{p}</span>
              ))}
            </div>
          );
        })()}
        {localStorage.getItem('shopLocation') && (
          <span className="receipt-location" style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', textAlign: 'center' }}>
            Manzil: {localStorage.getItem('shopLocation')}
          </span>
        )}
        <hr className="receipt-divider" style={{ border: 'none', borderTop: '1px dashed #000', margin: '8px 0' }} />
        {isReprint && (
          <p style={{ marginTop: '5px', fontWeight: 'bold', border: '1px dashed #000', padding: '2px', fontSize: '10px' }}>
            Qayta chiqarilgan chek
          </p>
        )}
      </div>
      
      <div style={{ marginBottom: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Chek N:</span>
          <span>{shiftReceiptNumber || dailyReceiptNumber || saleId}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Sana:</span>
          <span>{displayDateTime}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Kassir:</span>
          <span>{cashierName || 'Kassir'}</span>
        </div>
      </div>

      <div style={{ borderBottom: '1px dashed #000', margin: '5px 0' }}></div>

      <div style={{ margin: '10px 0' }}>
        {cartItems.map((item, index) => {
          const itemPct = parseFloat(item.discount || item.discount_percent) || 0;
          const itemTotalOriginal = item.qty * item.sell_price;
          const itemDiscAmount = Math.round(itemTotalOriginal * (itemPct / 100));
          const itemTotalFinal = itemTotalOriginal - itemDiscAmount;

          return (
            <div key={index} style={{ marginBottom: '6px', display: 'block', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', wordBreak: 'break-all', lineHeight: '1.2' }}>
                {index + 1}. {item.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#000', marginTop: '2px', paddingLeft: '12px' }}>
                <span>{item.qty} {item.unit || 'dona'} x {formatNumber(item.sell_price)} so'm</span>
                <span style={{ fontWeight: 'bold' }}>{formatNumber(itemTotalFinal)} so'm</span>
              </div>
              {itemPct > 0 && (
                <div style={{ fontSize: '10px', fontStyle: 'italic', paddingLeft: '12px', color: '#555' }}>
                  (Chegirma: -{itemPct}%)
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid #000', marginTop: '5px', paddingTop: '5px' }}>
        {overallDiscountAmount > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', fontSize: '11px', marginBottom: '2px' }}>
              <span>Savdo summasi:</span>
              <span>{formatNumber(totalOriginalAll)} so'm</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', fontSize: '11px', marginBottom: '4px' }}>
              <span>Chegirma {overallDiscountPercent > 0 ? `(${overallDiscountPercent}%)` : ''}:</span>
              <span>-{formatNumber(overallDiscountAmount)} so'm</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
          <span>JAMI:</span>
          <span>{formatNumber(total)} so'm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', marginTop: '2px' }}>
          <span>To'lov turi:</span>
          <span>{paymentMethodLabel}</span>
        </div>
      </div>

      {(() => {
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
        <p style={{ margin: '0' }}>Xaridingiz uchun rahmat!</p>
      </div>



      <div style={{
        marginTop: '10px',
        paddingTop: '7px',
        paddingBottom: '4px',
        borderTop: '1px dashed #888',
        textAlign: 'center',
        fontSize: '9px',
        lineHeight: '1.4',
        color: '#555'
      }}>
        Ushbu chek ichki hisob-kitob uchun.<br />
        Fiskal (soliq) cheki hisoblanmaydi!<br />
        Iltimos, kassirdan rasmiy fiskal chek talab qiling.
      </div>
    </div>
  );
});

PrintableReceipt.displayName = 'PrintableReceipt';
