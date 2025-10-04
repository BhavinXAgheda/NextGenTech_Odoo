import React, { useContext } from 'react';
import './App.css';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import SignUpPage from './SignUpPage';
import LoginPage from './LoginPage';
import AdminDashboardPage from './AdminDashboardPage';
import AuthContext from './AuthContext';
import Dashboard from './Dashboard';
import ProtectedRoute from './ProtectedRoute';

function App() {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="App">
      {user && (
        <button onClick={logout} className="logout-button">Logout</button>
      )}
      <nav className="main-nav">
        <div>
          <Link to="/">Home</Link>
          {!user ? (
            <>
              <Link to="/signup">Sign Up</Link>
              <Link to="/login">Login</Link>
            </>
          ) : (
            <Link to="/dashboard">Dashboard</Link>
          )}
        </div>
      </nav>

      <h1>Expense Management System</h1>

      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

export default App;
