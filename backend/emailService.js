const nodemailer = require('nodemailer');

let transporter; // This will hold the single, reusable transporter object

// This function initializes the email service when the server starts.
const initializeEmailService = async () => {
  // Generate a single test account for the server's lifetime
  let testAccount = await nodemailer.createTestAccount();

  console.log('--- Ethereal Test Account ---');
  console.log('Preview emails at: https://ethereal.email/login');
  console.log('User:', testAccount.user);
  console.log('Pass:', testAccount.pass);
  console.log('-----------------------------');

  // Create and assign the reusable transporter object
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });
};

const sendInvitationEmail = async (recipientEmail, tempPassword) => {
  if (!transporter) {
    throw new Error('Email service is not initialized. Call initializeEmailService() first.');
  }

  const mailOptions = {
    from: '"Expense Management System" <noreply@example.com>', // sender address
    to: recipientEmail, // list of receivers
    subject: 'Welcome to the Expense Management System!', // Subject line
    text: `Hello! Your account has been created. You can log in with your email and this temporary password: ${tempPassword}`, // plain text body
    html: `<h2>Welcome!</h2>
      <p>Your account has been created for the Expense Management System.</p>
      <p>You can log in using your email and the following temporary password:</p>
      <p><b>${tempPassword}</b></p>
      <p>We recommend changing your password after your first login.</p>`, // html body
  };

  let info = await transporter.sendMail(mailOptions);

  console.log('Message sent: %s', info.messageId);
  // Preview only available when sending through an Ethereal account
  console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
};

module.exports = { initializeEmailService, sendInvitationEmail };