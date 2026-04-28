import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShoppingCart, Smartphone, Trash2, Plus, Minus, Search, Banknote, X, Printer, User, Wallet, Gift, CreditCard } from 'lucide-react';

const Pos = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [menuRes, customerRes] = await Promise.all([
          axios.get('http://localhost:5000/api/menu'),
          axios.get('http://localhost:5000/api/customers')
        ]);
        setMenuItems(menuRes.data);
        setCustomers(customerRes.data);
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };
    fetchData();
  }, []);

  const addToCart = (item) => {
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      setCart(cart.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { ...item, qty: 1 }]);
    }
  };

  const updateQty = (id, delta) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

  const total = cart.reduce((acc, item) => acc + (parseFloat(item.price) * item.qty), 0);

  const startPolling = (checkoutID, orderData) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/check-payment/${checkoutID}`);
        
        if (res.data.status === 'Completed') {
          clearInterval(interval);
          setLoading(false);
          setActiveOrder({ 
            name: orderData.client, 
            amount: orderData.total, 
            method: 'M-Pesa', 
            items: orderData.items 
          });
          setShowReceipt(true);
          resetForm();
        } else if (res.data.status === 'Failed') {
          clearInterval(interval);
          setLoading(false);
          alert("Payment Failed or Timed Out.");
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 2500); 

    setTimeout(() => { clearInterval(interval); setLoading(false); }, 90000);
  };

  const resetForm = () => {
    setCart([]);
    setPhoneNumber('');
    setClientName('');
    setSelectedCustomer(null);
  };

  const handlePayment = async (method) => {
    if (cart.length === 0) return alert("Cart is empty");
    
    if (method === 'M-Pesa') return handleMpesaPayment();

    setLoading(true);
    const finalClientName = selectedCustomer ? selectedCustomer.full_name : (clientName || "Guest Customer");

    try {
      const payload = {
  amount: method === 'Complimentary' ? 0 : total,
  clientName: finalClientName,
  items: cart,
  paymentMethod: method,
  customerId: selectedCustomer?.customer_id || null,
  staffName: selectedCustomer?.full_name || null // ✅ ADD THIS
};

      await axios.post('http://localhost:5000/api/pay/unified', payload);

      setActiveOrder({ 
        name: finalClientName, 
        amount: method === 'Complimentary' ? 0 : total,
        method: method, 
        items: [...cart] 
      });
      setShowReceipt(true);
      resetForm();
      setLoading(false);
    } catch (err) {
      alert(`${method} payment failed. Check if server is running.`);
      setLoading(false);
    }
  };

  const handleMpesaPayment = async () => {
    if (!phoneNumber.startsWith('254') || phoneNumber.length !== 12) {
      alert("Please enter a valid format: 2547XXXXXXXX");
      return;
    }
    setLoading(true);
    const orderSnapshot = {
        total: total,
        client: clientName || "Guest Customer",
        items: [...cart]
    };
    try {
      const res = await axios.post('http://localhost:5000/api/pay/stk', {
        amount: total,
        phone: phoneNumber,
        clientName: orderSnapshot.client,
        items: orderSnapshot.items
      });
      alert("STK Push Sent!");
      startPolling(res.data.CheckoutRequestID, orderSnapshot);
    } catch (err) {
      alert("M-Pesa service failed.");
      setLoading(false);
    }
  };

  const filteredMenu = menuItems.filter(item => 
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="pos-layout">
      <div className="pos-main">
        <div className="pos-search-bar">
          <Search size={20} />
          <input 
            type="text" 
            placeholder="Search menu items..." 
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="product-grid">
          {filteredMenu.map(item => (
            <div key={item.id} className="menu-card" onClick={() => addToCart(item)}>
              <div className="menu-card-price">Ksh {item.price}</div>
              <h3 className="menu-card-name">{item.product_name}</h3>
              <span className="menu-card-cat">{item.category}</span>
              <div className="add-overlay"><Plus /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="pos-sidebar">
        <div className="order-header">
          <ShoppingCart size={22} />
          <h2>Current Order</h2>
        </div>

        <div className="order-items-list">
          {cart.length === 0 ? (
            <div className="empty-cart-msg">Select items to start order</div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="order-item-row">
                <div className="order-item-details">
                  <span className="order-item-name">{item.product_name}</span>
                  <span className="order-item-unit">Ksh {item.price}</span>
                </div>
                <div className="order-item-controls">
                  <button onClick={() => updateQty(item.id, -1)}><Minus size={14}/></button>
                  <span className="order-qty">{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)}><Plus size={14}/></button>
                  <Trash2 size={18} className="remove-btn" onClick={() => removeFromCart(item.id)} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="order-summary-footer">
          <div className="client-field">
            <label><User size={14}/> Select Account (Optional)</label>
            <select 
              className="customer-select"
              onChange={(e) => {
                const customer = customers.find(c => c.customer_id === parseInt(e.target.value));
                setSelectedCustomer(customer || null);
              }}
            >
              <option value="">Walk-in Customer</option>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.full_name} ({c.customer_type})
                </option>
              ))}
            </select>
          </div>

          {!selectedCustomer && (
             <div className="client-field">
               <label>Guest Name</label>
               <input type="text" placeholder="Enter name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
             </div>
          )}

          <div className="summary-row total">
            <span>Amount Due</span>
            <span>Ksh {total.toLocaleString()}</span>
          </div>

          <div className="action-buttons-grid">
            <button className="pay-btn mpesa" onClick={() => handlePayment('M-Pesa')} disabled={loading}>
              <Smartphone size={16}/> M-PESA
            </button>
            <button className="pay-btn cash" onClick={() => handlePayment('Cash')} disabled={loading}>
              <Banknote size={16}/> CASH
            </button>
            
            <button 
                className="pay-btn advance" 
                onClick={() => handlePayment('Advance')} 
                disabled={
  !selectedCustomer ||
  loading ||
  selectedCustomer.wallet_balance < total ||
  selectedCustomer.credit_balance > 0 // 🚫 BLOCK if debt exists
}
            >
                <Wallet size={16}/> WALLET ({selectedCustomer?.wallet_balance || 0})
            </button>

            <button 
                className="pay-btn credit" 
                onClick={() => handlePayment('Credit')} 
                disabled={!selectedCustomer || loading}
            >
                <CreditCard size={16}/> CREDIT
            </button>

            {/* --- COMPLIMENTARY BUTTON ADDED BELOW --- */}
            {(selectedCustomer?.customer_type === 'Owner' || selectedCustomer?.customer_type === 'Staff') && (
                <button 
                  className="pay-btn comp" 
                  style={{ backgroundColor: '#5856D6', color: 'white' }} 
                  onClick={() => handlePayment('Complimentary')} 
                  disabled={loading}
                >
                    <Gift size={16}/> COMP
                </button>
            )}
          </div>
        </div>
      </div>

      {showReceipt && (
        <div className="print-container">
          <div id="thermal-receipt" className="receipt-print-area">
            <div className="receipt-center">
              <h1 className="restaurant-name">FIRST CLASS LOGISTICS</h1>
              <p className="receipt-subtitle">Official Receipt</p>
            </div>
            <div className="receipt-info">
              <p><span>Date:</span> {new Date().toLocaleString()}</p>
              <p><span>Customer:</span> {activeOrder?.name}</p>
              <p><span>Payment:</span> {activeOrder?.method}</p>
            </div>
            <div className="receipt-divider">--------------------------------</div>
            <div className="receipt-items">
              {activeOrder?.items.map((item, index) => (
                <div key={index} className="receipt-line">
                  <div className="item-main">{item.product_name} x{item.qty}</div>
                  <div className="item-price">Ksh {(item.price * item.qty).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="receipt-divider">--------------------------------</div>
            <div className="receipt-totals">
              <div className="receipt-line grand-total">
                <span>TOTAL</span>
                <span>Ksh {activeOrder?.amount.toLocaleString()}</span>
              </div>
            </div>
            <div className="receipt-center footer">
              <p>Thank you for dining with us!</p>
              <p className="powered-by">Powered by Codey Craft Africa</p>
            </div>
          </div>
          <div className="print-actions">
            <button className="btn-print" onClick={() => window.print()}><Printer size={18} /> PRINT</button>
            <button className="btn-close" onClick={() => setShowReceipt(false)}>DONE</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pos;