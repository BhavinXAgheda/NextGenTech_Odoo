import React, { useState, useContext } from 'react';
import AuthContext from './AuthContext';

function ExpenseFormModal({ isOpen, onClose, onExpenseSubmitted }) {
  const { token } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'USD',
    category: 'Travel',
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('http://localhost:3001/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to submit expense.');
      
      onExpenseSubmitted(); // Callback to refresh the list on the dashboard
      onClose(); // Close the modal
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className="modal-close-button">&times;</button>
        <h2>Submit New Expense</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="notification notification-error">{error}</div>}
          <div className="form-group">
            <label>Amount</label>
            <input type="number" name="amount" value={formData.amount} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <input type="text" name="currency" value={formData.currency} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Category</label>
            <input type="text" name="category" value={formData.category} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px' }} required></textarea>
          </div>
          <div className="form-group">
            <label>Expense Date</label>
            <input type="date" name="expense_date" value={formData.expense_date} onChange={handleChange} required />
          </div>
          <button type="submit" disabled={isLoading}>{isLoading ? 'Submitting...' : 'Submit Expense'}</button>
        </form>
      </div>
    </div>
  );
}

export default ExpenseFormModal;