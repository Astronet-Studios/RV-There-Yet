const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;

const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
const resendFromEmail =
  (process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || '').trim();
const contactToEmail = 'RVTYmobile@outlook.com';

const requiredEmailEnvVars = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
const missingEmailVars = requiredEmailEnvVars.filter((key) => !process.env[key]);

if (missingEmailVars.length > 0) {
  console.warn(
    `Missing email environment variables: ${missingEmailVars.join(', ')}`
  );
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));

function parseResendError(resultError) {
  if (!resultError) return 'Unknown email provider error';
  if (typeof resultError === 'string') return resultError;
  if (resultError.message) return resultError.message;
  return JSON.stringify(resultError);
}

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, rvType, message } = req.body;

  // Validation
  if (!firstName || !lastName || !email || !rvType || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!resend || !resendFromEmail) {
    return res.status(500).json({
      error:
        'Email provider is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.',
    });
  }

  try {
    // Send email to business
    const businessSendResult = await resend.emails.send({
      from: resendFromEmail,
      to: [contactToEmail],
      subject: `New Contact Form Submission from ${firstName} ${lastName}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>RV Type:</strong> ${rvType}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
      replyTo: email,
    });

    if (businessSendResult.error) {
      throw new Error(parseResendError(businessSendResult.error));
    }

    // Send confirmation email to user
    const confirmationSendResult = await resend.emails.send({
      from: resendFromEmail,
      to: [email],
      subject: 'We received your message - RV There Yet',
      html: `
        <h2>Thank you for contacting RV There Yet!</h2>
        <p>Hi ${firstName},</p>
        <p>We've received your message and will get back to you as soon as possible.</p>
        <p><strong>Your Message Details:</strong></p>
        <p><strong>RV Type:</strong> ${rvType}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <br>
        <p>Best regards,<br>RV There Yet Mobile Camper Repair<br>(845) 239-9746</p>
      `,
    });

    if (confirmationSendResult.error) {
      throw new Error(parseResendError(confirmationSendResult.error));
    }

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Email error:', error);

    if (/domain is not verified|verify a domain/i.test(error.message || '')) {
      return res.status(500).json({
        error:
          'Resend sender domain is not verified yet. Verify your domain in Resend and try again.',
      });
    }

    res.status(500).json({ error: 'Failed to send email via Resend' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  if (!resendApiKey || !resendFromEmail) {
    console.warn(
      'Email sending disabled until RESEND_API_KEY and RESEND_FROM_EMAIL are configured.'
    );
  } else {
    console.log('Resend email provider configured');
  }
});
