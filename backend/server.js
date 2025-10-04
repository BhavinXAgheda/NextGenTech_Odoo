// backend/server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); // Import our database connection
const { protect } = require('./authMiddleware');
const axios = require('axios');
const { initializeEmailService, sendInvitationEmail } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Allow requests from our React frontend
app.use(express.json()); // Allow the server to parse JSON request bodies

// A simple test route to check the database connection
app.get('/api/health', async (req, res) => {
  try {
    // Get a connection from the pool and release it when done
    const [results] = await db.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      message: 'Server is running and database is connected.',
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed.',
    });
  }
});

// --- NEW: API Endpoint for Company and Admin Signup ---
app.post('/api/signup', async (req, res) => {
  const { companyName, email, password, default_currency } = req.body;

  // 1. Basic Validation
  if (!companyName || !email || !password || !default_currency) {
    return res.status(400).json({ message: 'Company name, email, password, and default currency are required.' });
  }

  const connection = await db.getConnection();

  try {
    // 2. Check if a user with that email already exists
    const [existingUsers] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // 3. Hash the password for security
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Use a transaction to ensure data integrity
    await connection.beginTransaction();

    // Insert the new company
    const [companyResult] = await connection.query(
      'INSERT INTO companies (name, default_currency) VALUES (?, ?)',
      [companyName, default_currency]
    );
    const companyId = companyResult.insertId;

    // Insert the new admin user, linking them to the new company
    await connection.query(
      'INSERT INTO users (company_id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)',
      [companyId, email, passwordHash, 'Admin', 'Admin'] // Use capitalized 'Admin' role
    );

    // If all queries succeed, commit the transaction
    await connection.commit();

    res.status(201).json({ message: 'Company and admin user created successfully!' });
  } catch (error) {
    await connection.rollback(); // If any query fails, roll back all changes
    console.error('Signup Error:', error);
    res.status(500).json({ message: 'Server error during signup process.' });
  } finally {
    connection.release(); // Release the connection back to the pool
  }
});

// --- API Endpoint for User Login ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1d', // Token expires in 1 day
    });

    res.json({
      message: 'Login successful',
      token,
      user: payload,
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// --- API Endpoint to get all users for the admin's company ---
// This route is protected. Only authenticated users can access it.
app.get('/api/users', protect, async (req, res) => {
  try {
    // req.user is attached by the 'protect' middleware
    const companyId = req.user.company_id;

    const [users] = await db.query('SELECT id, name, email, role FROM users WHERE company_id = ?', [companyId]);

    res.json(users);
  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({ message: 'Server error fetching users.' });
  }
});

// --- API Endpoint for an admin to add a new user ---
// This route is also protected.
app.post('/api/users/add', protect, async (req, res) => {
  // 1. Authorization: Check if the logged-in user is an admin
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Forbidden: Only Administrators can add users.' });
  }

  const { name, email, role, manager_id } = req.body;
  const companyId = req.user.company_id;

  if (!name || !email || !role) {
    return res.status(400).json({ message: 'Name, email, and role are required.' });
  }

  try {
    // For simplicity, we'll generate a random password.
    // In a real app, you'd email this to the user or use a password-reset flow.
    const tempPassword = Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    const [result] = await db.query(
      'INSERT INTO users (company_id, name, email, role, password_hash, manager_id) VALUES (?, ?, ?, ?, ?, ?)',
      [companyId, name, email, role, passwordHash, manager_id || null]
    );

    const newUser = { id: result.insertId, name, email, role };

    // Send the invitation email with the temporary password
    await sendInvitationEmail(email, tempPassword);

    // console.log(`User ${email} created with temporary password: ${tempPassword}`);
    res.status(201).json({ message: 'User created and invitation email sent successfully!', user: newUser });
  } catch (error) {
    console.error('Add User Error:', error);
    res.status(500).json({ message: 'Server error adding user.' });
  }
});

// --- API Endpoints for Managers ---

// Middleware to check if the user is a manager
const isManager = (req, res, next) => {
  if (req.user.role !== 'Manager') {
    return res.status(403).json({ message: 'Forbidden: Access is restricted to Managers.' });
  }
  next();
};

// GET expenses pending approval for the current manager's team
app.get('/api/manager/pending-expenses', protect, isManager, async (req, res) => {
  const managerId = req.user.id;
  const companyId = req.user.company_id;
  try {
    // New Logic: Fetch all 'Pending' expenses for the entire company.
    let [expenses] = await db.query(
      `SELECT 
         e.id, e.description, e.amount, e.currency, e.expense_date, e.category, u.name as employee_name,
         (SELECT GROUP_CONCAT(approver.name SEPARATOR ', ') 
          FROM approval_history ah 
          JOIN users approver ON ah.approver_id = approver.id 
          WHERE ah.expense_id = e.id AND ah.action = 'Approved') as approvers
       FROM expenses e
       JOIN users u ON e.employee_id = u.id
       WHERE e.company_id = ? AND e.status = 'Pending'`,
      [companyId]
    );

    const [company] = await db.query('SELECT default_currency FROM companies WHERE id = ?', [companyId]);
    const default_currency = company[0]?.default_currency || 'USD';

    // --- New Currency Conversion Logic ---
    const uniqueCurrencies = [...new Set(expenses.map(exp => exp.currency))];
    const ratesCache = {};

    for (const currency of uniqueCurrencies) {
      if (currency !== default_currency && !ratesCache[currency]) {
        try {
          const { data } = await axios.get(`https://api.exchangerate-api.com/v4/latest/${currency}`);
          ratesCache[currency] = data.rates;
        } catch (rateError) {
          console.error(`Could not fetch exchange rate for ${currency}:`, rateError.message);
          // If fetching fails, we can't convert, so we'll handle it on the frontend
        }
      }
    }

    expenses = expenses.map(exp => {
      if (exp.currency !== default_currency && ratesCache[exp.currency] && ratesCache[exp.currency][default_currency]) {
        const rate = ratesCache[exp.currency][default_currency];
        exp.converted_amount = (exp.amount * rate).toFixed(2);
      }
      return exp;
    });

    res.json({ expenses, default_currency });
  } catch (error) {
    console.error('Error fetching pending expenses:', error);
    res.status(500).json({ message: 'Server error fetching pending expenses.' });
  }
});

// GET analytics KPIs for the manager's team
app.get('/api/manager/kpis', protect, isManager, async (req, res) => {
  const managerId = req.user.id;
  const companyId = req.user.company_id;

  try {
    // Calculate Total Pending Amount
    const [pendingResult] = await db.query(
      `SELECT SUM(e.amount) as total_pending
       FROM expenses e
       JOIN users u ON e.employee_id = u.id
       WHERE u.manager_id = ? AND e.status = 'Pending'`,
      [managerId]
    );

    // Calculate Total Approved This Month
    const [approvedResult] = await db.query(
      `SELECT SUM(e.amount) as total_approved
       FROM expenses e
       JOIN users u ON e.employee_id = u.id
       WHERE u.manager_id = ? AND e.status = 'Approved' AND MONTH(e.created_at) = MONTH(CURRENT_DATE()) AND YEAR(e.created_at) = YEAR(CURRENT_DATE())`,
      [managerId]
    );

    res.json({
      total_pending: pendingResult[0].total_pending || 0,
      total_approved_month: approvedResult[0].total_approved || 0,
      // Avg. Approval Time would require more complex logic, returning placeholder for now
      avg_approval_time: 'N/A'
    });
  } catch (error) {
    console.error('Error fetching manager KPIs:', error);
    res.status(500).json({ message: 'Server error fetching KPIs.' });
  }
});

// GET top spenders for the manager's team (current month)
app.get('/api/manager/top-spenders', protect, isManager, async (req, res) => {
  const managerId = req.user.id;
  try {
    const [topSpenders] = await db.query(
      `SELECT u.name as employee_name, SUM(e.approved_amount) as total_spent
       FROM expenses e
       JOIN users u ON e.employee_id = u.id
       WHERE u.manager_id = ? 
         AND e.status = 'Approved' 
         AND MONTH(e.created_at) = MONTH(CURRENT_DATE()) 
         AND YEAR(e.created_at) = YEAR(CURRENT_DATE())
       GROUP BY e.employee_id, u.name
       ORDER BY total_spent DESC
       LIMIT 5`,
      [managerId]
    );
    res.json(topSpenders);
  } catch (error) {
    console.error('Error fetching top spenders:', error);
    res.status(500).json({ message: 'Server error fetching top spenders.' });
  }
});

// GET recently processed expenses by the current manager
app.get('/api/manager/recently-processed', protect, isManager, async (req, res) => {
  const managerId = req.user.id;
  try {
    const [processedExpenses] = await db.query(
      `SELECT
         e.id, e.description, u.name as employee_name, ah.action, ah.action_date
       FROM approval_history ah
       JOIN expenses e ON ah.expense_id = e.id
       JOIN users u ON e.employee_id = u.id
       WHERE ah.approver_id = ?
       ORDER BY ah.action_date DESC
       LIMIT 10`,
      [managerId]
    );
    res.json(processedExpenses);
  } catch (error) {
    console.error('Error fetching recently processed expenses:', error);
    res.status(500).json({ message: 'Server error fetching recently processed expenses.' });
  }
});

// POST to approve or reject an expense
app.post('/api/manager/action-expense/:expenseId', protect, isManager, async (req, res) => {
  const { expenseId } = req.params;
  const { action, comments, approved_amount } = req.body; // action can be 'Approved' or 'Rejected'
  const approverId = req.user.id;

  if (!['Approved', 'Rejected'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action specified.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [expenseDetails] = await connection.query('SELECT company_id, rule_id, current_step_id FROM expenses WHERE id = ?', [expenseId]);
    if (expenseDetails.length === 0) {
      throw new Error('Expense not found.');
    }
    const { company_id: companyId, rule_id: ruleId, current_step_id: currentStepId } = expenseDetails[0];

    // Log the action in the approval history
    await connection.query(
      'INSERT INTO approval_history (expense_id, approver_id, action, step_approved_amount, comments) VALUES (?, ?, ?, ?, ?)',
      [expenseId, approverId, action, action === 'Approved' ? approved_amount : null, comments || null]
    );

    if (action === 'Rejected') { // --- Rejection Logic ---
      // If anyone rejects, the expense is immediately rejected, regardless of the rule.
      await connection.query('UPDATE expenses SET status = ?, approved_amount = 0 WHERE id = ?', [action, expenseId]);
    } else { // --- Approval Logic ---
      if (ruleId && currentStepId) { // --- Sequential Flow ---
        const [currentStep] = await connection.query('SELECT step_sequence FROM approval_steps WHERE id = ?', [currentStepId]);
        const currentSequence = currentStep[0].step_sequence;

        // Find the next step in the sequence for this rule
        const [nextStep] = await connection.query(
          'SELECT id FROM approval_steps WHERE rule_id = ? AND step_sequence > ? ORDER BY step_sequence ASC LIMIT 1',
          [ruleId, currentSequence]
        );

        if (nextStep.length > 0) {
          // There is a next step, so advance the expense to it.
          await connection.query('UPDATE expenses SET current_step_id = ? WHERE id = ?', [nextStep[0].id, expenseId]);
        } else {
          // This was the final step, so the expense is fully approved.
          const finalAmount = approved_amount !== undefined ? approved_amount : (await connection.query('SELECT amount FROM expenses WHERE id = ?', [expenseId]))[0][0].amount;
          await connection.query('UPDATE expenses SET status = ?, approved_amount = ?, current_step_id = NULL WHERE id = ?', [action, finalAmount, expenseId]);
        }
      } else { // --- Fallback to "All Managers Approve" Flow ---
        // Prevent duplicate actions by the same manager
        const [existingAction] = await connection.query('SELECT id FROM approval_history WHERE expense_id = ? AND approver_id = ?', [expenseId, approverId]);
        if (existingAction.length > 1) { // Check > 1 because we just inserted the current one
          return res.status(409).json({ message: 'You have already actioned this expense.' });
        }

        // Check if all managers in the company have now approved it.
        const [managerCountResult] = await connection.query('SELECT COUNT(*) as total FROM users WHERE company_id = ? AND role = "Manager"', [companyId]);
        const totalManagers = managerCountResult[0].total;

        const [approvalCountResult] = await connection.query('SELECT COUNT(*) as total FROM approval_history WHERE expense_id = ? AND action = "Approved"', [expenseId]);
        const totalApprovals = approvalCountResult[0].total;

        if (totalApprovals >= totalManagers) {
          // This is the final approval, update the expense status.
          const finalAmount = approved_amount !== undefined ? approved_amount : (await connection.query('SELECT amount FROM expenses WHERE id = ?', [expenseId]))[0][0].amount;
          await connection.query('UPDATE expenses SET status = ?, approved_amount = ? WHERE id = ?', [action, finalAmount, expenseId]);
        }
        // If not all managers have approved, the status remains 'Pending', and we just wait.
      }
    }

    await connection.commit();
    res.json({ message: `Expense successfully ${action.toLowerCase()}.` });
  } catch (error) {
    await connection.rollback();
    console.error('Error actioning expense:', error);
    res.status(500).json({ message: 'Server error while processing the expense action.' });
  } finally {
    connection.release();
  }
});

// --- API Endpoints for Employees ---

// GET all expenses for the logged-in employee
app.get('/api/expenses', protect, async (req, res) => {
  const employeeId = req.user.id;
  try {
    const [expenses] = await db.query(
      'SELECT id, category, description, amount, approved_amount, currency, expense_date, status FROM expenses WHERE employee_id = ? ORDER BY expense_date DESC',
      [employeeId]
    );
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching employee expenses:', error);
    res.status(500).json({ message: 'Server error fetching expenses.' });
  }
});

// GET details for a single expense, including approval history
app.get('/api/expenses/:id', protect, async (req, res) => {
  const { id } = req.params;
  const employeeId = req.user.id;
  try {
    // First, get the expense and verify the employee owns it
    const [expenses] = await db.query('SELECT * FROM expenses WHERE id = ? AND employee_id = ?', [id, employeeId]);
    if (expenses.length === 0) {
      return res.status(404).json({ message: 'Expense not found or you do not have permission to view it.' });
    }
    const expense = expenses[0];

    // Then, get the approval history for that expense
    const [history] = await db.query(
      `SELECT ah.action, ah.comments, ah.action_date, u.name as approver_name
       FROM approval_history ah
       JOIN users u ON ah.approver_id = u.id
       WHERE ah.expense_id = ?
       ORDER BY ah.action_date ASC`,
      [id]
    );

    res.json({ ...expense, history });
  } catch (error) {
    console.error(`Error fetching expense detail for id ${id}:`, error);
    res.status(500).json({ message: 'Server error fetching expense details.' });
  }
});

// POST to submit a new expense
app.post('/api/expenses', protect, async (req, res) => {
  const employeeId = req.user.id;
  const companyId = req.user.company_id; // Get company_id from the authenticated user's token
  const { category, description, amount, currency, expense_date } = req.body;

  try {
    // --- New Logic to associate with a default rule ---
    // For now, we'll assume a simple rule exists. In a real app, this would be more dynamic.
    // Let's find the first sequential rule for the company.
    const [rules] = await db.query(
      `SELECT id FROM approval_rules WHERE company_id = ? AND rule_type = 'SEQUENTIAL' LIMIT 1`,
      [companyId]
    );

    const ruleId = rules.length > 0 ? rules[0].id : null;
    let firstStepId = null;
    if (ruleId) {
      const [steps] = await db.query('SELECT id FROM approval_steps WHERE rule_id = ? ORDER BY step_sequence ASC LIMIT 1', [ruleId]);
      if (steps.length > 0) firstStepId = steps[0].id;
    }

    const [result] = await db.query(
      'INSERT INTO expenses (employee_id, company_id, category, description, amount, currency, expense_date, rule_id, current_step_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [employeeId, companyId, category, description, amount, currency, expense_date, ruleId, firstStepId]
    );
    res.status(201).json({ message: 'Expense submitted successfully!', expenseId: result.insertId });
  } catch (error) {
    console.error('Error submitting expense:', error);
    res.status(500).json({ message: 'Server error submitting expense.' });
  }
});

// GET KPIs for the logged-in employee
app.get('/api/employee/kpis', protect, async (req, res) => {
  const employeeId = req.user.id;
  try {
    // Total Approved Amount: Note we sum the 'approved_amount'
    const [approvedResult] = await db.query(
      `SELECT SUM(approved_amount) as total FROM expenses WHERE employee_id = ? AND status = 'Approved'`,
      [employeeId]
    );

    // Total Pending Amount: We sum the original 'amount'
    const [pendingResult] = await db.query(
      `SELECT SUM(amount) as total FROM expenses WHERE employee_id = ? AND status = 'Pending'`,
      [employeeId]
    );

    // Total Rejected Amount: We sum the original 'amount'
    const [rejectedResult] = await db.query(
      `SELECT SUM(amount) as total FROM expenses WHERE employee_id = ? AND status = 'Rejected'`,
      [employeeId]
    );

    res.json({
      total_approved: approvedResult[0].total || 0,
      total_pending: pendingResult[0].total || 0,
      total_rejected: rejectedResult[0].total || 0,
    });
  } catch (error) {
    console.error('Error fetching employee KPIs:', error);
    res.status(500).json({ message: 'Server error fetching KPIs.' });
  }
});

// Initialize services and start the server
const startServer = async () => {
  await initializeEmailService(); // Set up the email transporter
  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
  });
};

startServer();
