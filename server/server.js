const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const datetime = require('node-datetime');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database Connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = db;

// Test Database Connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to MySQL:', err.message);
    } else {
        console.log('Connected to First Class Logistics Database successfully.');
        connection.release();
    }
});

// ✅ ADDED: LOCAL DATE FIX (IMPORTANT)
const getLocalDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - (offset * 60000));
    return local.toISOString().split('T')[0];
};
// --- MPESA HELPERS ---
const generateToken = async (req, res, next) => {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    try {
        const { data } = await axios.get(
            "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            { headers: { Authorization: `Basic ${auth}` } }
        );
        req.token = data.access_token;
        next();
    } catch (err) {
        console.error("Token Generation Error:", err.response?.data || err.message);
        res.status(500).json({ message: "Failed to generate M-Pesa token" });
    }
};

const updateStockLevels = (items, reason = 'Sale') => {
    items.forEach(item => {
        db.query(
            "UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE item_name = ?",
            [item.qty, item.product_name]
        );

        db.query(`
            INSERT INTO inventory_logs (item_name, qty, reason, created_at)
            VALUES (?, ?, ?, NOW())
        `, [item.product_name, item.qty, reason]);
    });
};

// --- ROUTES ---

// 1. Auth
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = `
        SELECT users.id, users.username, roles.role_name 
        FROM users 
        JOIN roles ON users.role_id = roles.id 
        WHERE users.username = ? AND users.password = ?
    `;
    db.query(sql, [username, password], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (results.length > 0) {
            res.json({
                success: true,
                user: { id: results[0].id, username: results[0].username, role: results[0].role_name }
            });
        } else {
            res.status(401).json({ success: false });
        }
    });
});

// Get all users and their roles (Admin Only)
// Get all users (Admin Only)
app.get('/api/admin/users', (req, res) => {
    const role = req.headers['user-role']; 
    
    if (role !== 'Admin') {
        return res.status(403).json({ message: "Access Denied" });
    }

    const sql = `
        SELECT users.id, users.username, roles.role_name 
        FROM users 
        JOIN roles ON users.role_id = roles.id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Create a new user (Admin Only)
app.post('/api/admin/create-user', (req, res) => {
    const { username, password, role_id } = req.body;
    const sql = "INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)";
    
    db.query(sql, [username, password, role_id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, message: "User created!" });
    });
});

// Reset User Password
app.put('/api/admin/reset-password', (req, res) => {
    const { userId, newPassword } = req.body;
    const role = req.headers['user-role'];

    if (role !== 'Admin') return res.status(403).json("Unauthorized");

    const sql = "UPDATE users SET password = ? WHERE id = ?";
    db.query(sql, [newPassword, userId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, message: "Password updated" });
    });
});

// Delete User
app.delete('/api/admin/delete-user/:id', (req, res) => {
    const userId = req.params.id;
    const role = req.headers['user-role'];

    if (role !== 'Admin') return res.status(403).json("Unauthorized");

    const sql = "DELETE FROM users WHERE id = ?";
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, message: "User removed" });
    });
});

// --- 1.5 CUSTOMER & ACCOUNTS MANAGER ---

// Get all customers (for POS dropdown and Account Page)
app.get('/api/customers', (req, res) => {
    db.query("SELECT * FROM customers ORDER BY full_name ASC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Create new customer/staff/owner profile
app.post('/api/customers/create', (req, res) => {
    const { full_name, customer_type, phone_number } = req.body;
    const sql = "INSERT INTO customers (full_name, customer_type, phone_number) VALUES (?, ?, ?)";
    db.query(sql, [full_name, customer_type, phone_number], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, id: result.insertId });
    });
});

// TOP-UP WALLET (Handling the Advance Payment)
app.put('/api/customers/topup', (req, res) => {
    const { customer_id, amount, clientName } = req.body;
    const topupAmount = parseFloat(amount);

    // 1. Get current balances
    db.query("SELECT credit_balance, wallet_balance FROM customers WHERE customer_id = ?", [customer_id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: "Customer not found" });

        let debt = parseFloat(results[0].credit_balance || 0);
        let wallet = parseFloat(results[0].wallet_balance || 0);
        let newDebt = Math.max(0, debt - topupAmount);
        let newWallet = topupAmount > debt ? (topupAmount - debt) + wallet : wallet;

        // 2. Update Customer Balances
        db.query(
            "UPDATE customers SET credit_balance=?, wallet_balance=? WHERE customer_id=?",
            [newDebt, newWallet, customer_id],
            (err2) => {
                if (err2) return res.status(500).json(err2);

                // 3. ONLY ONE ENTRY in Sales table, marked as 'Topup'
                // This ensures it doesn't get confused with a 'Food Sale'
                db.query(`
                    INSERT INTO sales (client_name, total_price, payment_status, payment_method, sale_date)
                    VALUES (?, ?, 'Completed', 'Topup', NOW())
                `, [`Deposit: ${clientName}`, topupAmount], (err3) => {
                    res.json({ success: true });
                });
            }
        );
    });
});

// ✅ NEW: Get Total Outstanding Credit across all customers
app.get('/api/customers/total-credit', (req, res) => {
    const sql = "SELECT SUM(credit_balance) as total_credit FROM customers";
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Credit Query Error:", err);
            return res.status(500).json(err);
        }
        // results[0].total_credit will be null if no rows exist, so we use || 0
        const total = results[0].total_credit || 0;
        res.json({ total_credit: total });
    });
});

app.get('/api/customers/:id/statement', (req, res) => {
    const customerId = req.params.id;
    const sql = `
        SELECT s.sale_date, si.product_name, si.qty, si.price, s.payment_method
        FROM sales s
        JOIN sales_items si ON s.id = si.sale_id
        WHERE s.customer_id = ?
        ORDER BY s.sale_date DESC`;
    
    db.query(sql, [customerId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 2. Menu
app.get('/api/menu', (req, res) => {
    db.query("SELECT * FROM menu_items", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 3. MPESA
app.post('/api/pay/stk', generateToken, async (req, res) => {
    const { phone, amount, clientName, items } = req.body;
    const shortCode = process.env.MPESA_SHORTCODE || "174379";
    const passkey = process.env.MPESA_PASSKEY;

    const dt = datetime.create();
    const timestamp = dt.format('YmdHMS');
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');

    try {
        const { data } = await axios.post(
            "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
            {
                BusinessShortCode: shortCode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerPayBillOnline",
                Amount: amount,
                PartyA: phone,
                PartyB: shortCode,
                PhoneNumber: phone,
                CallBackURL: process.env.CALLBACK_URL,
                AccountReference: "FirstClassHotels",
                TransactionDesc: `Food for ${clientName}`
            },
            { headers: { Authorization: `Bearer ${req.token}` } }
        );

        console.log("STK Push Initiated:", data.CheckoutRequestID);

        const sql = `INSERT INTO sales (client_name, total_price, payment_status, mpesa_checkout_id, sale_date) VALUES (?, ?, 'Pending', ?, NOW())`;

        db.query(sql, [clientName, amount, data.CheckoutRequestID], (err, result) => {
            if (err) {
                console.error("DB Insert Error:", err);
                return;
            }

            const saleId = result.insertId;
            console.log("Incoming Items:", items);

            const itemValues = items.map(item => {
                console.log("ITEM:", item);
                return [saleId, item.product_name, item.qty, item.price];
            });

            const itemSql = `INSERT INTO sales_items (sale_id, product_name, qty, price) VALUES ?`;

            db.query(itemSql, [itemValues], (itemErr) => {
                if (itemErr) console.error("Item Insert Error:", itemErr);
                else console.log("Items inserted OK for sale:", saleId);
            });

            res.json(data);
        });

    } catch (err) {
        console.error("STK Error:", err.response?.data || err.message);
        res.status(500).json({ message: "STK Push Failed" });
    }
});

// ✅ ADD THE NEW POLLING ROUTE HERE
app.get('/api/check-payment/:checkoutID', (req, res) => {
    const { checkoutID } = req.params;
    const sql = "SELECT payment_status FROM sales WHERE mpesa_checkout_id = ?";
    
    db.query(sql, [checkoutID], (err, results) => {
        if (err) {
            console.error("Status Check Error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (results.length === 0) {
            return res.status(404).json({ status: "Not Found" });
        }
        res.json({ status: results[0].payment_status });
    });
});

// ✅ RESTORED CASH ROUTE
app.post('/api/pay/cash', (req, res) => {
    const { clientName, amount, items } = req.body;

    const sql = "INSERT INTO sales (client_name, total_price, payment_status, sale_date) VALUES (?, ?, 'Completed', NOW())";

    db.query(sql, [clientName, amount], (err, result) => {
        if (err) {
            console.error("Cash Insert Error:", err);
            return res.status(500).json({ success: false });
        }

        const saleId = result.insertId;

        const itemValues = items.map(item => [
            saleId,
            item.product_name,
            item.qty,
            item.price
        ]);

        const itemSql = `INSERT INTO sales_items (sale_id, product_name, qty, price) VALUES ?`;

        db.query(itemSql, [itemValues], (itemErr) => {
            if (itemErr) {
                console.error("Cash Item Insert Error:", itemErr);
                return res.status(500).json({ success: false });
            }

            res.json({ success: true });
        });
    });
});

// --- UNIFIED POS PAYMENT (Cash, Credit, Advance, Comp) ---
app.post('/api/pay/unified', (req, res) => {
    const { clientName, amount, items, paymentMethod, customerId } = req.body;

    let finalPrice = amount;
    let paymentStatus = 'Completed';

    // If staff/complimentary, price is 0 for accounts, but items must be logged for inventory
    if (paymentMethod === 'Complimentary') {
        finalPrice = 0;
    } else if (paymentMethod === 'Credit') {
        paymentStatus = 'Unpaid';
    }

    const sql = `INSERT INTO sales (client_name, total_price, payment_status, payment_method, customer_id, sale_date) 
                 VALUES (?, ?, ?, ?, ?, NOW())`;

    db.query(sql, [clientName, finalPrice, paymentStatus, paymentMethod, customerId || null], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const saleId = result.insertId;
        const itemValues = items.map(item => [saleId, item.product_name, item.qty, item.price]);
        const itemSql = `INSERT INTO sales_items (sale_id, product_name, qty, price) VALUES ?`;

        db.query(itemSql, [itemValues], (itemErr) => {
            if (itemErr) return res.status(500).json({ success: false });

            // Wallet deduction
if (paymentMethod === 'Advance' && customerId) {
    db.query("UPDATE customers SET wallet_balance = wallet_balance - ? WHERE customer_id = ?", [amount, customerId]);
}

// Credit increase
if (paymentMethod === 'Credit' && customerId) {
    db.query("UPDATE customers SET credit_balance = credit_balance + ? WHERE customer_id = ?", [amount, customerId]);
}

// 🔥 INVENTORY ALWAYS RUNS
let reason = 'Sale';
if (paymentMethod === 'Complimentary') {
    reason = 'Staff/Owner Meal';
}

updateStockLevels(items, reason);

res.json({ success: true, saleId });
        });
    });
});

// 4. CALLBACK
app.post('/api/callback', (req, res) => {
    console.log("MPESA CALLBACK RECEIVED:", JSON.stringify(req.body, null, 2));

    const callbackData = req.body.Body.stkCallback;
    const checkoutID = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;

    // Logic: 0 is Success. 1037 (Timeout), 1 (Cancelled), or others = Failed
    const finalStatus = (resultCode === 0) ? 'Completed' : 'Failed';

    db.query(
        "UPDATE sales SET payment_status = ? WHERE mpesa_checkout_id = ?",
        [finalStatus, checkoutID],
        (err) => {
            if (err) console.error("Callback DB Error:", err);
            else console.log(`Payment marked as ${finalStatus}:`, checkoutID);
        }
    );

    res.json("Received");
});
// 5. SALES REPORT
// 5. SALES REPORT

app.get('/api/reports/sales-summary', (req, res) => {
    const { date } = req.query;
    const selectedDate = date || getLocalDate();

    // Query 1: Itemized Table
    // Added client_name to the SELECT and GROUP BY
    const itemizedSql = `
        SELECT product_name, SUM(qty) as total_qty, MAX(price) as price, 
               SUM(qty * price) as total_revenue, payment_status, payment_method, client_name
        FROM (
            SELECT si.product_name, si.qty, si.price, s.payment_status, s.payment_method, s.client_name
            FROM sales_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE DATE(s.sale_date) = ?
            UNION ALL
            SELECT client_name as product_name, 1 as qty, total_price as price, 
                   payment_status, payment_method, client_name
            FROM sales
            WHERE DATE(sale_date) = ? AND payment_method = 'Topup'
        ) AS combined
        GROUP BY product_name, payment_status, payment_method, client_name
        ORDER BY total_revenue DESC`;

    // ... (Keep the rest of your paymentSql and db.query logic the same)

    // Query 2: Actual Cash Inflow (This is for your Daily Net Card)
    // ONLY counts 'Cash' and 'MPesa'. Strictly ignores 'Advance', 'Credit', and 'Complimentary'
    const paymentSql = `
        SELECT payment_method, SUM(total_price) as total 
        FROM sales 
        WHERE DATE(sale_date) = ? 
        AND payment_status = 'Completed'
        AND payment_method IN ('Cash', 'MPesa', 'Topup')
        GROUP BY payment_method`;

    db.query(itemizedSql, [selectedDate, selectedDate], (err, itemResults) => {
        if (err) return res.status(500).json(err);

        db.query(paymentSql, [selectedDate], (err, payResults) => {
            if (err) return res.status(500).json(err);

            const payments = { Cash: 0, MPesa: 0, Credit: 0, Advance: 0, Topup: 0 };
            payResults.forEach(row => {
                const method = row.payment_method;
                if (payments.hasOwnProperty(method)) {
                    payments[method] = parseFloat(row.total);
                }
            });

            res.json({
                itemized: itemResults,
                payments: payments
            });
        });
    });
});
// ================= 🔥 ADVANCED REPORTING ROUTES =================

app.get('/api/reports/advanced-summary', (req, res) => {
    const sql = `
        SELECT DATE(sale_date) as date, SUM(total_price) as total
        FROM sales
        WHERE payment_status = 'Completed' AND payment_method IN ('Cash', 'Mpesa')
        GROUP BY DATE(sale_date)
        ORDER BY date DESC
        LIMIT 30
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/api/reports/payment-breakdown', (req, res) => {
    const { date } = req.query;
    const sql = `
        SELECT payment_method, SUM(total_price) as total -- Change payment_status to payment_method
        FROM sales
        WHERE DATE(sale_date) = ?
        GROUP BY payment_method
    `;
    db.query(sql, [date], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/api/reports/top-items', (req, res) => {
    const { date } = req.query;
    const sql = `
        SELECT si.product_name, SUM(si.qty) as total_qty
        FROM sales_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE DATE(s.sale_date) = ?
        AND s.payment_status = 'Completed'
        GROUP BY si.product_name
        ORDER BY total_qty DESC
        LIMIT 5
    `;
    db.query(sql, [date], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/api/reports/hourly-sales', (req, res) => {
    const { date } = req.query;
    const sql = `
        SELECT HOUR(s.sale_date) as hour, SUM(s.total_price) as total
        FROM sales s
        WHERE DATE(s.sale_date) = ?
        AND s.payment_status = 'Completed'
        GROUP BY hour
        ORDER BY hour
    `;
    db.query(sql, [date], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/api/reports/monthly-cumulative', (req, res) => {
    const { month } = req.query; 
    const sql = `
        SELECT COALESCE(SUM(total_price), 0) as total_revenue 
        FROM sales 
        WHERE DATE_FORMAT(sale_date, '%Y-%m') = ? 
        AND payment_status = 'Completed' 
        AND payment_method IN ('Cash', 'MPesa', 'Topup') -- Ignores 'Advance' and 'Credit'
    `;

    db.query(sql, [month], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json({ total_revenue: parseFloat(results[0].total_revenue) });
    });
});

// ================= 🛒 INVENTORY & AUDIT ROUTES =================

// --- WEEKLY INVENTORY LOGIC ---
app.get('/api/inventory', (req, res) => {
    // 1. Calculate the start of the current week (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const startOfWeek = new Date(now.setDate(now.getDate() - dayOfWeek));
    startOfWeek.setHours(0, 0, 0, 0);
    const formattedStart = startOfWeek.toISOString().split('T')[0];

    const sql = `
        SELECT 
            i.id, 
            i.item_name, 
            i.unit_measure, 
            i.opening_stock, 
            i.added_stock,
            COALESCE(SUM(si.qty / y.yield_per_unit), 0) as total_units_sold
        FROM inventory i
        LEFT JOIN yield_rules y ON i.item_name = y.material_name
        LEFT JOIN sales_items si ON y.menu_item_name = si.product_name
        LEFT JOIN sales s ON si.sale_id = s.id 
            AND s.payment_status = 'Completed' 
            AND s.sale_date >= ?
        GROUP BY i.id
    `;

    db.query(sql, [formattedStart], (err, results) => {
        if (err) return res.status(500).json(err);
        
        const inventoryWithCalculations = results.map(item => {
            const opening = parseFloat(item.opening_stock);
            const added = parseFloat(item.added_stock);
            const sold = parseFloat(item.total_units_sold);
            const closingUnits = opening + added - sold;

            // --- UNIT DISPLAY LOGIC ---
            // Extract the number from "2kg Packet" or "50kg Bag"
            const weightMatch = item.unit_measure.match(/(\d+)/);
            const unitWeight = weightMatch ? parseInt(weightMatch[0]) : 1;

            let displayStock = "";
            let displayOpening = "";

            if (item.item_name.toLowerCase().includes("potato")) {
                // Show as: 7 (50kg each)
                displayStock = `${Math.floor(closingUnits)} (${item.unit_measure} each)`;
                displayOpening = `${opening} (${item.unit_measure})`;
            } else {
                // Show cumulative: 22 kg
                const totalKg = Math.floor(closingUnits * unitWeight);
                displayStock = `${totalKg} kg`;
                displayOpening = `${opening * unitWeight} kg`;
            }

            return {
                ...item,
                displayOpening,
                displayStock,
                stock_quantity: Math.floor(closingUnits),
                units_sold: Math.ceil(sold)
            };
        });

        res.json(inventoryWithCalculations);
    });
});
app.post('/api/inventory/add-stock', (req, res) => {
    const { item_id, quantity_to_add } = req.body;
    const sql = "UPDATE inventory SET stock_quantity = stock_quantity + ?, added_stock = added_stock + ? WHERE id = ?";
    db.query(sql, [quantity_to_add, quantity_to_add, item_id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });
});

app.post('/api/inventory/add-new', (req, res) => {
    const { item_name, unit_measure, stock_quantity } = req.body;
    const sql = "INSERT INTO inventory (item_name, unit_measure, stock_quantity, opening_stock) VALUES (?, ?, ?, ?)";
    db.query(sql, [item_name, unit_measure, stock_quantity, stock_quantity], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });
});

// ✅ UPDATED: Precision Audit Logic
app.get('/api/inventory/audit-report', (req, res) => {
    const sql = `
        SELECT 
            i.item_name, i.unit_measure, i.stock_quantity, i.opening_stock, i.added_stock,
            y.menu_item_name, y.yield_per_unit,
            (SELECT COALESCE(SUM(si.qty), 0) 
             FROM sales_items si 
             JOIN sales s ON si.sale_id = s.id 
             WHERE si.product_name = y.menu_item_name 
             AND s.payment_status = 'Completed') as total_sold
        FROM inventory i
        LEFT JOIN yield_rules y ON i.item_name = y.material_name
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);

        const groupedAudit = {};

        results.forEach(row => {
            if (!groupedAudit[row.item_name]) {
                groupedAudit[row.item_name] = {
                    name: row.item_name,
                    unit: row.unit_measure,
                    currentInStore: row.stock_quantity,
                    totalStartStore: parseFloat(row.opening_stock) + parseFloat(row.added_stock),
                    soldItems: []
                };
            }
            if (row.menu_item_name && row.total_sold > 0) {
                groupedAudit[row.item_name].soldItems.push({
                    name: row.menu_item_name,
                    qty: row.total_sold,
                    yield: row.yield_per_unit
                });
            }
        });
        app.get('/api/reports/customer-usage-timeline/:id', (req, res) => {
    const customerId = req.params.id;

    // 1. Find the date of the most recent Topup for this customer
    const lastTopUpSql = `
        SELECT sale_date, total_price 
        FROM sales 
        WHERE customer_id = ? AND payment_method = 'Topup' 
        ORDER BY sale_date DESC LIMIT 1`;

    db.query(lastTopUpSql, [customerId], (err, topUpResults) => {
        if (err) return res.status(500).json(err);

        const lastDate = topUpResults.length > 0 ? topUpResults[0].sale_date : '1970-01-01';
        const lastAmount = topUpResults.length > 0 ? topUpResults[0].total_price : 0;

        // 2. Fetch all meals ordered since that Topup date
        const mealSql = `
            SELECT si.product_name, si.qty, si.price, (si.qty * si.price) as total_revenue, s.sale_date as created_at
            FROM sales_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.customer_id = ? 
            AND s.sale_date >= ?
            AND s.payment_method != 'Topup'
            ORDER BY s.sale_date DESC`;

        db.query(mealSql, [customerId, lastDate], (err2, mealResults) => {
            if (err2) return res.status(500).json(err2);
            
            res.json({
                lastTopUp: { date: lastDate, amount: lastAmount },
                orders: mealResults
            });
        });
    });
});

        const finalReport = Object.values(groupedAudit).map(mat => {
            let totalFractionalUsed = 0;
            let kitchenSummary = [];

            mat.soldItems.forEach(item => {
                const unitsUsed = item.qty / item.yield;
                totalFractionalUsed += unitsUsed;

                // Calculate how many portions are left in the currently "Open" bag/unit
                const fullUnitsOpened = Math.ceil(unitsUsed);
                const portionsLeft = (fullUnitsOpened * item.yield) - item.qty;
                
                kitchenSummary.push(`${portionsLeft} portions left from the opened ${mat.unit}`);
            });

            // CHANGE: We use Math.floor because if 0.04 of a bag is used, 
            // the store is missing 1 full bag (it's now in the kitchen).
            const exactRemaining = mat.totalStartStore - totalFractionalUsed;
            const wholeUnitsInStore = Math.floor(exactRemaining);
            
            let message = "";
            if (mat.soldItems.length > 0) {
                const soldDetails = mat.soldItems.map(si => `${si.qty} ${si.name}`).join(', ');
                message = `Sold: ${soldDetails}. You should have ${kitchenSummary.join(' and ')}. ` +
                          `The Store should have ${wholeUnitsInStore} full ${mat.unit} remaining.`;
            } else {
                message = `No sales recorded. Store should have ${mat.totalStartStore} ${mat.unit}.`;
            }

            return {
                item: mat.name,
                message: message,
                shouldBe: wholeUnitsInStore // Returns a whole number now
            };
        });

        res.json(finalReport);
    });
});

app.get('/', (req, res) => {
    res.send("POS API running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});