import React, { useContext } from 'react';
import AuthContext from './AuthContext';
import AdminDashboardPage from './AdminDashboardPage';
import ManagerDashboardPage from './ManagerDashboardPage';
import EmployeeDashboardPage from './EmployeeDashboardPage';

function Dashboard() {
  const { user } = useContext(AuthContext);

  // If the user object is not yet available, show a loading message.
  if (!user) {
    return <p>Loading dashboard...</p>;
  }

  // Render the correct dashboard based on the user's role
  switch (user?.role) {
    case 'Admin':
      return <AdminDashboardPage />;
    case 'Manager':
      return <ManagerDashboardPage />;
    case 'Employee':
      return <EmployeeDashboardPage />;
    default:
      // This can be a loading spinner or a fallback message
      return <p>Unknown user role. Please contact support.</p>;
  }
}

export default Dashboard;