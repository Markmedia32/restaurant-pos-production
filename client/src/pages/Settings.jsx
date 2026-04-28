import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Key } from 'lucide-react';
import axios from 'axios';

const Settings = () => {
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState({ username: '', password: '', role_id: 2 });
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));

    // Authentication Guard
    useEffect(() => {
        if (!currentUser) {
            navigate('/');
        } else if (currentUser.role !== 'Admin') {
            navigate('/pos'); // Cashiers can't be here
        } else {
            fetchUsers();
        }
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/admin/users', {
                headers: { 'user-role': currentUser?.role }
            });
            setUsers(res.data);
        } catch (err) { console.error(err); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:5000/api/admin/create-user', form);
            alert("User Created");
            fetchUsers();
        } catch (err) { alert("Error creating user"); }
    };

    const handleResetPassword = async (id) => {
        const newPass = prompt("Enter new password for this user:");
        if (newPass) {
            await axios.put('http://localhost:5000/api/admin/reset-password', 
                { userId: id, newPassword: newPass },
                { headers: { 'user-role': currentUser.role }}
            );
            alert("Password updated successfully");
        }
    };

    const handleDelete = async (id, name) => {
        if (window.confirm(`Are you sure you want to delete ${name}?`)) {
            await axios.delete(`http://localhost:5000/api/admin/delete-user/${id}`, {
                headers: { 'user-role': currentUser.role }
            });
            fetchUsers();
        }
    };

    return (
        <div className="settings-viewport">
            <div className="settings-header"><h1>System Settings</h1></div>
            <div className="settings-grid">
                <div className="settings-card">
                    <h3>Add New Staff</h3>
                    <form className="settings-form" onSubmit={handleCreate}>
                        <input type="text" placeholder="Username" required onChange={e => setForm({...form, username: e.target.value})} />
                        <input type="password" placeholder="Password" required onChange={e => setForm({...form, password: e.target.value})} />
                        <select onChange={e => setForm({...form, role_id: parseInt(e.target.value)})}>
                            <option value="2">Cashier</option>
                            <option value="1">Admin</option>
                        </select>
                        <button type="submit" className="settings-submit-btn">Create Account</button>
                    </form>
                </div>

                <div className="settings-card staff-table-container">
                    <h3>Existing Staff</h3>
                    <table className="staff-table">
                        <thead>
                            <tr><th>Username</th><th>Role</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td>{u.username}</td>
                                    <td><span className={`role-badge ${u.role_name === 'Admin' ? 'role-admin' : 'role-cashier'}`}>{u.role_name}</span></td>
                                    <td>
                                        <button onClick={() => handleResetPassword(u.id)} className="action-icon-btn"><Key size={16} /></button>
                                        {u.username !== currentUser.username && (
                                            <button onClick={() => handleDelete(u.id, u.username)} className="action-icon-btn delete"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Settings;