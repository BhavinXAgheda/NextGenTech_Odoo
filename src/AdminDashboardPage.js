import React, { useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';

function AdminDashboardPage() {
  const { token } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Employee', manager_id: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const managers = users.filter(user => user.role === 'Manager');

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('http://localhost:3001/api/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch users.');
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on component mount

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => {
      const updatedUser = { ...prev, [name]: value };
      // If the role is changed to Manager, clear the manager_id
      if (name === 'role' && value === 'Manager') {
        updatedUser.manager_id = '';
      }
      return updatedUser;
    });
  };

  const handleAddUser = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/users/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newUser),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to add user.');

      setUsers(prevUsers => [...prevUsers, data.user]); // Add new user to the list
      setNewUser({ name: '', email: '', role: 'Employee', manager_id: '' }); // Reset form
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <h2>Admin Dashboard</h2>
      {error && <div className="notification notification-error">{error}</div>}
      <h3>Manage Users</h3>
      <form onSubmit={handleAddUser}>
        <div className="form-group">
          <input type="text" name="name" placeholder="Full Name" value={newUser.name} onChange={handleInputChange} required />
        </div>
        <div className="form-group">
          <input type="email" name="email" placeholder="Email" value={newUser.email} onChange={handleInputChange} required />
        </div>
        <div className="form-group">
          <select name="role" value={newUser.role} onChange={handleInputChange} style={{ width: '100%', padding: '0.75rem' }}>
            <option value="Employee">Employee</option>
            <option value="Manager">Manager</option>
          </select>
        </div>
        {newUser.role === 'Employee' && (
          <div className="form-group">
            <label>Assign Manager</label>
            <select name="manager_id" value={newUser.manager_id} onChange={handleInputChange} style={{ width: '100%', padding: '0.75rem' }} required>
              <option value="" disabled>Select a manager...</option>
              {managers.map(manager => (
                <option key={manager.id} value={manager.id}>{manager.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Adding User...' : 'Add User'}
          </button>
        </div>
      </form>
      <hr />
      <h4>Existing Users:</h4>
      <ul>
        {users.map(user => (
          <li key={user.id}>
            {user.name} ({user.email}) - <strong>{user.role}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminDashboardPage;