import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus, AlertCircle, RefreshCcw, Edit, Save, X, ArrowUp, ArrowDown, BarChart3, Calendar } from 'lucide-react';

const Inventory = () => {
    const [stock, setStock] = useState([]);
    const [auditMessages, setAuditMessages] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    
    // Form States
    const [newItem, setNewItem] = useState({ item_name: '', unit_measure: '', stock_quantity: 0 });
    const [updateAmount, setUpdateAmount] = useState({ id: null, val: '' });

    // Calculate the current week range for display (Sunday to Saturday)
    const getWeekRange = () => {
        const now = new Date();
        const start = new Date(now.setDate(now.getDate() - now.getDay()));
        const end = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        return `${start.toLocaleDateString('en-GB', {day:'numeric', month:'short'})} - ${end.toLocaleDateString('en-GB', {day:'numeric', month:'short'})}`;
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const inv = await axios.get('http://localhost:5000/api/inventory');
            const audit = await axios.get('http://localhost:5000/api/inventory/audit-report');
            
            // Process the data for smart display logic
            const processedStock = inv.data.map(item => {
                // Extract number from "2kg Packet" -> 2
                const weightMatch = item.unit_measure.match(/(\d+)/);
                const unitWeight = weightMatch ? parseInt(weightMatch[0]) : 1;
                
                const opening = parseFloat(item.opening_stock) || 0;
                const added = parseFloat(item.added_stock) || 0;
                const sold = parseFloat(item.units_sold) || 0;
                
                // Calculate closing balance in units
                const closingUnits = opening + added - sold;

                let displayStock = "";
                let displayOpening = "";

                // LOGIC: Potatoes show units, everything else shows cumulative weight (kg)
                if (item.item_name.toLowerCase().includes("potato")) {
                    displayStock = `${Math.floor(closingUnits)} (${item.unit_measure} each)`;
                    displayOpening = `${opening} (${item.unit_measure})`;
                } else {
                    displayStock = `${Math.floor(closingUnits * unitWeight)} kg`;
                    displayOpening = `${Math.floor(opening * unitWeight)} kg`;
                }

                return { 
                    ...item, 
                    displayStock, 
                    displayOpening,
                    units_sold: Math.ceil(sold), // Round up to show whole units sold
                    stock_quantity: closingUnits 
                };
            });

            setStock(processedStock);
            setAuditMessages(audit.data);
        } catch (err) {
            console.error("Fetch error", err);
        }
    };

    const handleAddProduct = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:5000/api/inventory/add-new', newItem);
            setShowAddModal(false);
            loadData();
        } catch (err) { alert("Error adding product"); }
    };

    const handleQuickUpdate = async (id) => {
        try {
            await axios.post('http://localhost:5000/api/inventory/add-stock', { 
                item_id: id, 
                quantity_to_add: updateAmount.val 
            });
            setUpdateAmount({ id: null, val: '' });
            loadData();
        } catch (err) { alert("Update failed"); }
    };

    return (
        <div className="inventory-page" style={{ padding: '20px' }}>
            <header className="inventory-header">
                <div>
                    <h1><Package size={32} color="#0071e3" /> Digital Storehouse</h1>
                    <p className="inventory-subtitle">
                        <Calendar size={14} style={{ marginRight: '5px' }} /> 
                        Weekly Cycle: <strong>{getWeekRange()}</strong>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-outline" onClick={loadData}><RefreshCcw size={16} /> Refresh Audit</button>
                    <button className="btn-primary" onClick={() => setShowAddModal(true)}><Plus size={18} /> Add New Item</button>
                </div>
            </header>

            {/* --- LIVE STOCK SUMMARY CARDS --- */}
            <div className="recon-grid" style={{ marginBottom: '25px' }}>
                <div className="audit-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <BarChart3 color="#0071e3" size={24} />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '14px', color: '#666' }}>Active Items</h4>
                            <p style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>{stock.length}</p>
                        </div>
                    </div>
                </div>
                <div className="audit-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <ArrowUp color="#2a9d8f" size={24} />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '14px', color: '#666' }}>Total Restocks</h4>
                            <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#2a9d8f' }}>
                                {stock.reduce((acc, curr) => acc + (parseFloat(curr.added_stock) || 0), 0)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="audit-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <ArrowDown color="#e63946" size={24} />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '14px', color: '#666' }}>Units Sold (Live)</h4>
                            <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#e63946' }}>
                                {stock.reduce((acc, curr) => acc + (curr.units_sold || 0), 0)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- RECONCILIATION / AUDIT SECTION --- */}
            <section className="recon-section">
                <h3><AlertCircle size={20} /> Today's Kitchen Audit</h3>
                <div className="recon-grid">
                    {auditMessages.map((msg, i) => {
                        const itemStock = stock.find(s => s.item_name === msg.item);
                        const hasVariance = itemStock && parseFloat(itemStock.stock_quantity) !== parseFloat(msg.shouldBe);

                        return (
                            <div key={i} className={`audit-card ${hasVariance ? 'variance-warning' : ''}`}>
                                <h4>{msg.item}</h4>
                                <p>{msg.message}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* --- STOCK TABLE --- */}
            <div className="stock-container">
                <div className="stock-table-header">
                    <h3>Current Inventory Levels</h3>
                </div>
                <table className="inventory-table">
                    <thead>
                        <tr>
                            <th>Material Name</th>
                            <th>Opening (Sun)</th>
                            <th>Added</th>
                            <th>Sold/Used</th>
                            <th>In Stock (Closing)</th>
                            <th>Status</th>
                            <th>Update Store</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stock.map((item) => {
                            const itemAudit = auditMessages.find(a => a.item === item.item_name);
                            const isMismatched = itemAudit && parseFloat(item.stock_quantity) !== parseFloat(itemAudit.shouldBe);
                            const isLow = item.stock_quantity < 5;

                            return (
                                <tr key={item.id} style={isMismatched ? { backgroundColor: '#fff5f5' } : {}}>
                                    <td className="item-name-cell">
                                        <strong>{item.item_name}</strong>
                                        {isMismatched && <span style={{color: '#e63946', fontSize: '10px', display: 'block'}}>⚠️ Stock Discrepancy</span>}
                                    </td>
                                    
                                    {/* These are the columns that were missing */}
                                    <td style={{ color: '#666' }}>{item.displayOpening}</td>
                                    <td style={{ color: '#2a9d8f' }}>+{item.added_stock}</td>
                                    <td style={{ color: '#e63946' }}>-{item.units_sold}</td>
                                    
                                    <td style={{ fontWeight: '800', fontSize: '1.1rem', color: (isLow || isMismatched) ? '#e63946' : '#2a9d8f' }}>
                                        {item.displayStock}
                                        {isMismatched && (
                                            <span style={{fontSize: '11px', fontWeight: '400', display: 'block', color: '#666'}}>
                                                Expected: {itemAudit.shouldBe}
                                            </span>
                                        )}
                                    </td>

                                    <td>
                                        <span className={`stock-badge ${ (isLow || isMismatched) ? 'stock-low' : 'stock-healthy'}`}>
                                            {isMismatched ? 'Check Usage' : isLow ? 'Low Stock' : 'Optimal'}
                                        </span>
                                    </td>
                                    <td>
                                        {updateAmount.id === item.id ? (
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <input 
                                                    type="number" 
                                                    style={{ width: '60px', padding: '5px' }} 
                                                    placeholder="Qty"
                                                    onChange={(e) => setUpdateAmount({...updateAmount, val: e.target.value})}
                                                />
                                                <button className="btn-primary" onClick={() => handleQuickUpdate(item.id)}><Save size={14}/></button>
                                                <button onClick={() => setUpdateAmount({id:null, val:''})}><X size={14}/></button>
                                            </div>
                                        ) : (
                                            <button className="btn-outline" onClick={() => setUpdateAmount({id: item.id, val: ''})}>
                                                <Edit size={14} /> Add Stock
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* --- ADD PRODUCT MODAL --- */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Add New Store Item</h3>
                        <form onSubmit={handleAddProduct}>
                            <label>Item Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Wheat Flour"
                                required 
                                onChange={(e) => setNewItem({...newItem, item_name: e.target.value})} 
                            />
                            
                            <label>Unit Measure</label>
                            <input 
                                type="text" 
                                placeholder="e.g. 2kg Packet"
                                required 
                                onChange={(e) => setNewItem({...newItem, unit_measure: e.target.value})} 
                            />
                            
                            <label>Current Stock Quantity</label>
                            <input 
                                type="number" 
                                placeholder="0"
                                required 
                                onChange={(e) => setNewItem({...newItem, stock_quantity: e.target.value})} 
                            />
                            
                            <div className="modal-actions">
                                <button type="submit" className="btn-primary">Save to Store</button>
                                <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <footer className="inventory-footer">
                <span className="branding-tag">Property Flow POS • Codey Craft Africa</span>
            </footer>
        </div>
    );
};

export default Inventory;