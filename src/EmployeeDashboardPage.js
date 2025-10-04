import React, { useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';
import ExpenseFormModal from './ExpenseFormModal';

function EmployeeDashboardPage() {
  const { token } = useContext(AuthContext);
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState({
    total_approved: 0,
    total_pending: 0,
    total_rejected: 0,
  });
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      // Fetch expenses and KPIs in parallel for better performance
      const [expensesRes, kpisRes] = await Promise.all([
        fetch('http://localhost:3001/api/expenses', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('http://localhost:3001/api/employee/kpis', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (!expensesRes.ok || !kpisRes.ok) {
        throw new Error('Failed to fetch dashboard data.');
      }

      const expensesData = await expensesRes.json();
      const kpisData = await kpisRes.json();

      setExpenses(expensesData);
      setKpis(kpisData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once when the component mounts

  const handleExpenseSubmitted = () => {
    fetchData(); // Re-fetch all data after a new one is submitted
  };

  return (
    <div className="page-container" style={{ maxWidth: '900px' }}>
      <h2>Employee Dashboard</h2>
      {error && <div className="notification notification-error">{error}</div>}

      {/* --- Key Metrics Section --- */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'space-around' }}>
        <div style={{ textAlign: 'center' }}>
          <h4>Total Approved</h4>
          <p style={{ color: '#28a745', fontSize: '1.2rem', fontWeight: 'bold' }}>${parseFloat(kpis.total_approved).toFixed(2)}</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4>Total Pending</h4>
          <p style={{ color: '#ffc107', fontSize: '1.2rem', fontWeight: 'bold' }}>${parseFloat(kpis.total_pending).toFixed(2)}</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4>Total Rejected</h4>
          <p style={{ color: '#dc3545', fontSize: '1.2rem', fontWeight: 'bold' }}>${parseFloat(kpis.total_rejected).toFixed(2)}</p>
        </div>
      </div>

      <button onClick={() => setIsModalOpen(true)} style={{ width: 'auto', padding: '0.75rem 1.5rem', marginBottom: '2rem' }}>
        + Submit a New Expense
      </button>

      <ExpenseFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onExpenseSubmitted={handleExpenseSubmitted}
      />

      <h3>Your Expense History</h3>
      {isLoading ? (
        <div className="spinner-container">
          <div className="spinner"></div>
        </div>
      ) : expenses.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>You have not submitted any expenses yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Date</th>
              <th style={{ padding: '0.5rem' }}>Category</th>
              <th style={{ padding: '0.5rem' }}>Description</th>
              <th style={{ padding: '0.5rem' }}>Amount</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(exp => (
              <tr key={exp.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{new Date(exp.expense_date).toLocaleDateString()}</td>
                <td style={{ padding: '0.5rem' }}>{exp.category}</td>
                <td style={{ padding: '0.5rem' }}>{exp.description}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                  {exp.status === 'Approved' && exp.approved_amount !== exp.amount ? (
                    <>
                      <span style={{ textDecoration: 'line-through', color: '#999' }}>{exp.amount}</span><br/>
                      <strong style={{ color: '#28a745' }}>{exp.approved_amount} {exp.currency}</strong>
                    </>
                  ) : `${exp.amount} ${exp.currency}`}
                </td>
                <td style={{ padding: '0.5rem' }}>{exp.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default EmployeeDashboardPage;