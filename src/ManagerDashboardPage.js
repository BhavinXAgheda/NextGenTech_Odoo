import React, { useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';
import { Link } from 'react-router-dom';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// --- Placeholder Components for a clean layout ---
const PlaceholderChart = ({ title }) => (
  <div style={{ border: '1px dashed #ccc', padding: '1rem', textAlign: 'center', color: '#999', borderRadius: '8px' }}>
    <h4>{title}</h4>
    <p>(Chart data will be loaded here)</p>
  </div>
);

const KPI = ({ title, value }) => (
  <div style={{ flex: 1, textAlign: 'center', padding: '1rem', background: '#f0f4f8', borderRadius: '8px' }}>
    <h4 style={{ margin: 0, color: '#555' }}>{title}</h4>
    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.5rem 0 0 0', color: '#4a90e2' }}>{value}</p>
  </div>
);

function ManagerDashboardPage() {
  const { token } = useContext(AuthContext);
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [companyCurrency, setCompanyCurrency] = useState('USD');
  const [kpis, setKpis] = useState({
    total_pending: 0,
    total_approved_month: 0,
    avg_approval_time: 'N/A'
  });
  const [editingExpense, setEditingExpense] = useState({ id: null, amount: '' });
  const [topSpenders, setTopSpenders] = useState([]);
  const [recentlyProcessed, setRecentlyProcessed] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      setIsLoading(true);
      setError('');
      try {
        // Run API calls in parallel for better performance
        const [pendingRes, kpisRes, topSpendersRes, processedRes] = await Promise.all([
          fetch('http://localhost:3001/api/manager/pending-expenses', {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch('http://localhost:3001/api/manager/kpis', {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch('http://localhost:3001/api/manager/top-spenders', {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch('http://localhost:3001/api/manager/recently-processed', {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
        ]);

        if (!pendingRes.ok || !kpisRes.ok || !topSpendersRes.ok || !processedRes.ok) {
          throw new Error('Failed to fetch dashboard data.');
        }

        const pendingData = await pendingRes.json();
        const kpisData = await kpisRes.json();
        const topSpendersData = await topSpendersRes.json();
        const processedData = await processedRes.json();

        setPendingExpenses(pendingData.expenses);
        setCompanyCurrency(pendingData.default_currency);
        setKpis(kpisData);
        setTopSpenders(topSpendersData);
        setRecentlyProcessed(processedData);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on component mount

  const handleStartEdit = (expense) => {
    setEditingExpense({
      id: expense.id,
      amount: expense.converted_amount || expense.amount,
    });
  };

  const handleCancelEdit = () => {
    setEditingExpense({ id: null, amount: '' });
  };

  const handleAction = async (expenseId, action, amount) => {
    try {
      const body = { action };
      if (action === 'Approved') {
        body.approved_amount = amount;
      }

      const response = await fetch(`http://localhost:3001/api/manager/action-expense/${expenseId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // If the API call fails, we would ideally revert the UI change.
        // For now, we'll just log an error.
        throw new Error(`Failed to ${action.toLowerCase()} expense.`);
      }

      // On success, remove the item from the list.
      setPendingExpenses(prev => prev.filter(exp => exp.id !== expenseId));
      // TODO: Re-fetch KPIs to reflect the new approved amount.
    } catch (err) {
      setError(err.message);
      // Here you would re-fetch the data to get the correct state
    }
  };

  return (
    <div className="page-container">
      <h2>Manager Dashboard</h2>
      {error && <div className="notification notification-error">{error}</div>}
      {/* --- Key Action Items --- */}
      <section>
        <h3>Key Action Items</h3>
        <h4>Pending Approvals ({pendingExpenses.length})</h4>
        {isLoading ? (
          <div className="spinner-container">
            <div className="spinner"></div>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {pendingExpenses.length > 0 ? pendingExpenses.map(exp => (
              <li key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '4px', marginBottom: '0.5rem' }}>
                <div>
                  <strong>{exp.employee_name}</strong> - {exp.category}<br />
                  <small>{new Date(exp.expense_date).toLocaleDateString()} - {exp.description}</small><br/>
                  {exp.approvers && (
                    <small style={{ color: '#28a745', fontStyle: 'italic' }}>Approved by: {exp.approvers}</small>
                  )}
                </div>
                {editingExpense.id === exp.id ? (
                  // --- Inline Approval Form ---
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      value={editingExpense.amount}
                      onChange={(e) => setEditingExpense(prev => ({ ...prev, amount: e.target.value }))}
                      style={{ width: '100px', padding: '0.5rem' }}
                    />
                    <button onClick={() => handleAction(exp.id, 'Approved', editingExpense.amount)} style={{ width: 'auto', padding: '0.5rem', background: '#28a745' }}>✓</button>
                    <button onClick={handleCancelEdit} style={{ width: 'auto', padding: '0.5rem', background: '#6c757d' }}>×</button>
                  </div>
                ) : (
                  // --- Default Action Buttons ---
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '1rem', fontWeight: 'bold', fontSize: '1.1rem', textAlign: 'right' }}>
                      {exp.amount} {exp.currency}
                      {exp.converted_amount && <><br/><small style={{ fontWeight: 'normal' }}>~ {exp.converted_amount} {companyCurrency}</small></>}
                    </span>
                    <button onClick={() => handleStartEdit(exp)} style={{ width: 'auto', padding: '0.5rem 1rem', marginRight: '0.5rem', background: '#28a745' }}>Approve</button>
                    <button onClick={() => handleAction(exp.id, 'Rejected')} style={{ width: 'auto', padding: '0.5rem 1rem', background: '#dc3545' }}>Reject</button>
                  </div>
                )}
              </li>
            )) : <p>No expenses are currently pending your approval.</p>}
          </ul>
        )}
        {/* Placeholder for Recently Processed */}
        <h4 style={{marginTop: '2rem'}}>Recently Processed</h4>
        {recentlyProcessed.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {recentlyProcessed.map(exp => (
              <li key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{exp.employee_name} - <small>{exp.description}</small></span>
                <span style={{ fontWeight: 'bold', color: exp.action === 'Approved' ? '#28a745' : '#dc3545' }}>
                  {exp.action}
                </span>
              </li>
            ))}
          </ul>
        ) : <p style={{color: '#999'}}>You have not processed any expenses recently.</p>}
      </section>

      <hr style={{ margin: '2rem 0' }} />

      {/* --- Analytics & Insights --- */}
      <section>
        <h3>Analytics & Insights</h3>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <KPI title="Total Pending Amount" value={`${companyCurrency} ${parseFloat(kpis.total_pending).toFixed(2)}`} />
          <KPI title="Total Approved (Month)" value={`${companyCurrency} ${parseFloat(kpis.total_approved_month).toFixed(2)}`} />
          <KPI title="Avg. Approval Time" value={kpis.avg_approval_time} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <PlaceholderChart title="Spending by Category" />
          <PlaceholderChart title="Expense Trends (6 Months)" />
        </div>
      </section>

      <hr style={{ margin: '2rem 0' }} />

      {/* --- Team Management & Oversight --- */}
      <section>
        <h3>Team Management & Oversight</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h4>View Team Expenses</h4>
            <p>Drill down into all expenses submitted by your team members.</p>
          </div>
          <div>
            <h4>Top Spenders (This Month)</h4>
            {topSpenders.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, color: '#555' }}>
                {topSpenders.map((spender, index) => (
                  <li key={index}>{index + 1}. {spender.employee_name} - {companyCurrency} {parseFloat(spender.total_spent).toFixed(2)}</li>
                ))}
              </ul>
            ) : <p style={{color: '#999'}}>No approved spending this month.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

export default ManagerDashboardPage;