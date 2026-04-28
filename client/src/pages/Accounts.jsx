import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronUp, History } from 'lucide-react';

const Accounts = () => {
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [expandedCard, setExpandedCard] = useState(null); // Track which card is showing details

    const totalDebt = customers.reduce((acc, c) => acc + parseFloat(c.credit_balance || 0), 0);
    const totalWallet = customers.reduce((acc, c) => acc + parseFloat(c.wallet_balance || 0), 0);
    const netDebt = totalDebt - totalWallet;

    const [newCustomer, setNewCustomer] = useState({
        full_name: '',
        customer_type: 'Regular',
        phone_number: ''
    });

    useEffect(() => {
        fetchCustomers();
    }, []);

    useEffect(() => {
        const reconcileExistingBalances = async () => {
            const customersToSettle = customers.filter(c => 
                parseFloat(c.credit_balance) > 0 && 
                parseFloat(c.wallet_balance) >= parseFloat(c.credit_balance)
            );

            for (const customer of customersToSettle) {
                try {
                    await axios.put('http://localhost:5000/api/customers/reconcile', {
                        customer_id: customer.customer_id,
                        autoSettle: true
                    });
                    fetchCustomers();
                } catch (err) {
                    console.error("Auto-settle failed for " + customer.full_name, err);
                }
            }
        };

        if (customers.length > 0) {
            reconcileExistingBalances();
        }
    }, [customers]);

    const fetchCustomers = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/customers');
            // Adding a local orders array to each customer object
            const customersWithOrders = res.data.map(c => ({ ...c, orders: [] }));
            setCustomers(customersWithOrders);
        } catch (err) {
            console.error("Error fetching customers", err);
        }
    };

    const fetchCustomerUsage = async (customerId) => {
        if (expandedCard === customerId) {
            setExpandedCard(null);
            return;
        }
        
        try {
            const res = await axios.get(`http://localhost:5000/api/reports/customer-orders/${customerId}`);
            setCustomers(prev => prev.map(c => 
                c.customer_id === customerId ? { ...c, orders: res.data } : c
            ));
            setExpandedCard(customerId);
        } catch (err) {
            console.error("Error fetching customer usage", err);
        }
    };

    const handleCreateCustomer = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:5000/api/customers/create', newCustomer);
            setShowModal(false);
            setNewCustomer({ full_name: '', customer_type: 'Regular', phone_number: '' });
            fetchCustomers();
        } catch (err) {
            alert("Error creating customer");
        }
    };

   const handleTopUp = async () => {
    if (!topUpAmount || !selectedCustomer) return;
    const amount = parseFloat(topUpAmount);
    
    try {
        await axios.put('http://localhost:5000/api/customers/topup', {
            customer_id: selectedCustomer.customer_id,
            amount: amount,
            clientName: selectedCustomer.full_name,
            // Ensure your backend uses this to create a Sales record
            payment_method: 'Topup', 
            payment_status: 'Completed',
            deductDebtFirst: true 
        });

        setShowTopUpModal(false);
        setTopUpAmount('');
        fetchCustomers(); // Refresh the list to show new balances
        alert("Top-up successful! Revenue has been updated.");
    } catch (err) {
        console.error(err);
        alert("Top-up failed");
    }
};

    const filteredCustomers = customers.filter(c => 
        c.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="accounts-container">
            <style dangerouslySetInnerHTML={{ __html: `
                .usage-breakdown-section {
                    margin-top: 15px;
                    border-top: 1px solid #eee;
                    padding-top: 10px;
                }
                .usage-item {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.85rem;
                    padding: 4px 0;
                    color: #555;
                }
                .usage-date { font-size: 0.7rem; color: #999; }
                .btn-view-usage {
                    background: none;
                    border: none;
                    color: #0071e3;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 0;
                    margin-bottom: 10px;
                }
            `}} />

            <header className="accounts-header">
                <div>
                    <h1>Accounts Manager</h1>
                    <p>Net Outstanding Debt: <strong>KSh {netDebt.toLocaleString()}</strong></p>
                </div>
                <button className="btn-primary" onClick={() => setShowModal(true)}>+ Register New Account</button>
            </header>

            <div className="search-bar-container">
                <input 
                    type="text" 
                    placeholder="Search by name..." 
                    className="account-search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="accounts-grid">
                {filteredCustomers.map(customer => (
                    <div key={customer.customer_id} className="customer-card">
                        <div className="customer-info">
                            <h3>{customer.full_name}</h3>
                            <span className={`badge badge-${customer.customer_type.toLowerCase()}`}>
                                {customer.customer_type}
                            </span>
                            <p>{customer.phone_number || "No Phone"}</p>
                        </div>
                        
                        <div className="customer-stats">
                            <div className="stat">
                                <label>Wallet (Advance)</label>
                                <span className="balance-text positive">KSh {parseFloat(customer.wallet_balance).toLocaleString()}</span>
                            </div>
                            <div className="stat">
                                <label>Credit (Debt)</label>
                                <span className="balance-text negative">KSh {parseFloat(customer.credit_balance).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* USAGE BREAKDOWN TOGGLE */}
                        <div className="usage-breakdown-section">
                            <button className="btn-view-usage" onClick={() => fetchCustomerUsage(customer.customer_id)}>
                                <History size={14} /> 
                                {expandedCard === customer.customer_id ? "Hide Usage" : "View Meal Breakdown"}
                                {expandedCard === customer.customer_id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>

                            {expandedCard === customer.customer_id && (
                                <div className="usage-list">
                                    {customer.orders?.length > 0 ? (
                                        customer.orders.slice(0, 5).map((order, i) => (
                                            <div key={i} className="usage-item">
                                                <div>
                                                    <span style={{fontWeight: '600'}}>{order.product_name}</span>
                                                    <div className="usage-date">{new Date(order.created_at).toLocaleDateString()}</div>
                                                </div>
                                                <span>- KSh {parseFloat(order.total_revenue).toLocaleString()}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{fontSize: '0.75rem', color: '#999'}}>No recent transactions found.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="card-actions">
                            <button className="btn-secondary" onClick={() => {
                                setSelectedCustomer(customer);
                                setShowTopUpModal(true);
                            }}>Top Up Wallet</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Register Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Register Account</h2>
                        <form onSubmit={handleCreateCustomer}>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input type="text" required onChange={(e) => setNewCustomer({...newCustomer, full_name: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label>Category</label>
                                <select onChange={(e) => setNewCustomer({...newCustomer, customer_type: e.target.value})}>
                                    <option value="Regular">Regular (Advance User)</option>
                                    <option value="Staff">Employee</option>
                                    <option value="Owner">Owner (Complimentary)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Phone Number</label>
                                <input type="text" onChange={(e) => setNewCustomer({...newCustomer, phone_number: e.target.value})} />
                            </div>
                            <div className="modal-footer">
                                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Save Account</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Top-Up Modal */}
            {showTopUpModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Top Up & Reconcile</h2>
                        <p>Adding KSh to <strong>{selectedCustomer?.full_name}</strong>. System will automatically clear debt first.</p>
                        <div className="form-group">
                            <label>Amount (KES)</label>
                            <input 
                                type="number" 
                                placeholder="e.g. 5000"
                                value={topUpAmount}
                                onChange={(e) => setTopUpAmount(e.target.value)} 
                            />
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setShowTopUpModal(false)}>Cancel</button>
                            <button className="btn-primary" onClick={handleTopUp}>Confirm Payment</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Accounts;