const nodemailer = require("nodemailer");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static("public"));
require("dns").setDefaultResultOrder("ipv4first");

const otpStore = {};

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FB_DATABASE_URL
});

const db = admin.database();

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    family: 4,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

app.post("/api/forgot-password-otp", async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[email] = {
        otp,
        expires: Date.now() + 10 * 60 * 1000 // 10 mins
    };

    try {
        await transporter.sendMail({
            from: '"BIT-CT VOTEHUB" <votehubbitct@gmail.com>',
            to: email,
            subject: "Password Reset OTP",
            html: `
                <div style="font-family:sans-serif;padding:20px">
                    <h2 style="color:#2563eb">Password Reset Request</h2>
                    <p>Your OTP code is:</p>
                    <h1 style="letter-spacing:4px">${otp}</h1>
                    <p>This expires in 10 minutes.</p>
                </div>
            `
        });

        res.json({ message: "OTP sent" });

    } catch (err) {
        res.status(500).json({ message: "Email failed" });
    }
});

async function sendEmailOTP(to, otp) {
    try {
        const mailOptions = {
            from: '"BIT-CT VOTEHUB" <votehubbitct@gmail.com>',
            to: to,
            subject: `Your BIT-CT VoteHub Verification Code`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
                    <div style="background-color: #2563eb; padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -1px; text-transform: uppercase;">BIT-CT VoteHub</h1>
                    </div>
                    
                    <div style="padding: 40px 30px; text-align: center;">
                        <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Verify Your Identity</h2>
                        <p style="color: #64748b; font-size: 15px; line-height: 1.5;">To complete your account registration, please use the verification code below:</p>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px;">
                            <span style="display: block; font-family: monospace; font-size: 32px; font-weight: 900; color: #2563eb; letter-spacing: 2px;">
                                ${otp}
                            </span>
                        </div>
                        
                        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
                            This code is valid for 10 minutes. <br> 
                            If you did not request this, please ignore this email or contact the Administrator.
                        </p>
                    </div>

                    <div style="background-color: #f1f5f9; padding: 20px; text-align: center;">
                        <p style="margin: 0; font-size: 11px; color: #64748b; font-weight: bold;">
                            &copy; 2026 BIT-CT VOTEHUB
                        </p>
                    </div>
                </div>
            `
        };

        console.log("[!] About to send email to:", to);

        const info = await transporter.sendMail(mailOptions);

        console.log("Email sent:", info.response);
        return true;
    } catch (err) {
        console.error("Email failed:", err.message);
        throw err;
    }
}

async function successRegistered(to, studentId, voterNumber) {
    try {
        const mailOptions = {
            from: '"BIT-CT VOTEHUB" <votehubbitct@gmail.com>',
            to: to,
            subject: "Account Successfully Registered - Pending Approval",
            html: `
                <div style="font-family: sans-serif; border: 1px solid #e2e8f0; padding: 20px; border-radius: 10px; background:#ffffff;">
                    
                    <h2 style="color: #f59e0b;">ACCOUNT PENDING APPROVAL</h2>
                    
                    <p style="color:#475569;">
                        Thank you for registering at <strong>BIT-CT VoteHub</strong>.
                    </p>

                    <p style="color:#475569;">
                        Your account has been successfully created but is currently
                        <strong>pending approval by the administrator</strong>.
                    </p>

                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; margin-top: 15px;">
                        <p><strong>Voter Number:</strong> VOTER #${voterNumber}</p>
                        <p><strong>Student ID:</strong> ${studentId}</p>
                        <p><strong>Status:</strong> Pending Approval</p>
                    </div>

                    <div style="margin-top: 15px; padding: 12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">
                        <p style="margin:0; font-size:13px; color:#9a3412;">
                            ⚠ You will not be able to log in until your account is approved by the administrator.
                        </p>
                    </div>

                    <p style="font-size: 12px; color: #64748b; margin-top: 15px;">
                        Please wait for a confirmation email once your account has been approved.
                    </p>

                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

                    <strong style="color:#1e293b;">BIT-CT VOTEHUB 2026</strong>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log("Pending approval email sent to:", to);
        return true;

    } catch (err) {
        console.error("Email failed:", err.message);
        throw err;
    }
}

async function sendVotingReceipt(to, voterName, ballot) {

    // 🟢 SAFE: directly use position name sent from frontend OR fallback
    const ballotData = Object.keys(ballot).map(posId => ({
        position: ballot[posId]?.position || "Unknown Position",
        name: ballot[posId]?.name || "Unknown Candidate"
    }));

    const ballotItems = ballotData.map(item => {
        return `
            <div style="padding: 12px; margin-bottom: 8px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; text-align: left;">
                <p style="margin: 0; font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${item.position}
                </p>
                <p style="margin: 4px 0 0 0; font-size: 16px; color: #1e293b; font-weight: bold;">
                    ${item.name}
                </p>
            </div>
        `;
    }).join('');

    const qrJson = JSON.stringify({
        v: voterName,
        b: ballotData,
        t: Date.now()
    });

    const qrBuffer = await QRCode.toBuffer(qrJson);

    const mailOptions = {
        from: '"BIT-CT VOTEHUB" <votehubbitct@gmail.com>',
        to: to,
        subject: "Your Vote has been Cast!",
        attachments: [
            {
                filename: "qr.png",
                content: qrBuffer,
                cid: "voteqr"
            }
        ],
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
                <div style="background-color: #2563eb; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0; letter-spacing: 1px;">VOTE CONFIRMED</h2>
                </div>

                <div style="padding: 30px;">
                    <p style="color: #475569; font-size: 16px;">Hi <strong>${voterName}</strong>,</p>

                    <h3 style="font-size: 14px; color: #1e293b; margin: 25px 0 12px 0; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">
                        Your Selected Candidates
                    </h3>

                    <div style="margin-bottom: 30px;">
                        ${ballotItems}
                    </div>

                    <div style="text-align:center; padding: 20px; background: #f1f5f9; border-radius: 12px; border: 1px dashed #cbd5e1;">
                        <p style="font-size:12px; color:#64748b; margin-bottom: 10px; font-weight: bold;">
                            SCAN TO VERIFY BALLOT INTEGRITY
                        </p>
                        <img src="cid:voteqr" style="width:180px; height:180px; background:white; padding:10px; border-radius:12px;" />
                    </div>
                </div>
            </div>
        `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("EMAIL SENT:", info.messageId);

    return info;
}

async function sendApprovedEmail(to, studentId, name) {
    try {
        const mailOptions = {
            from: '"BIT-CT VOTEHUB" <votehubbitct@gmail.com>',
            to: to,
            subject: "Account Approved",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background:#2563eb; padding:24px; text-align:center;">
                        <h2 style="color:#fff; margin:0;">BIT-CT VOTEHUB</h2>
                    </div>

                    <div style="padding:30px;">
                        <h3 style="color:#1e293b; margin-top:0;">Account Approved</h3>
                        <p style="color:#475569; font-size:14px; line-height:1.6;">
                            Hello ${name || "Student"},
                        </p>
                        <p style="color:#475569; font-size:14px; line-height:1.6;">
                            Your account has been approved by the administrator.
                            You may now log in to BIT-CT VoteHub using your Student ID.
                        </p>

                        <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #cbd5e1; margin:20px 0;">
                            <p style="margin:0; font-size:14px;"><strong>Student ID:</strong> ${studentId}</p>
                            <p style="margin:8px 0 0 0; font-size:14px;"><strong>Status:</strong> Approved</p>
                        </div>

                        <p style="font-size:12px; color:#64748b;">
                            BIT-CT VOTEHUB 2026
                        </p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log("Approval email sent to:", to);
        return true;
    } catch (err) {
        console.error("Approval email failed:", err.message);
        throw err;
    }
}


app.post("/api/forgot-password-verify", (req, res) => {
    const { email, otp } = req.body;

    const record = otpStore[email];

    if (!record) {
        return res.status(400).json({ message: "No OTP requested" });
    }

    if (Date.now() > record.expires) {
        delete otpStore[email];
        return res.status(400).json({ message: "OTP expired" });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
    }

    res.json({ message: "OTP verified" });
});

app.post("/api/reset-password", async (req, res) => {
    const { email, newPassword } = req.body;

    if (!otpStore[email]) {
        return res.status(400).json({ message: "Unauthorized" });
    }

    try {
        const dbRef = ref(db, "voters");

        const snap = await get(dbRef);

        if (!snap.exists()) {
            return res.status(404).json({ message: "No users found" });
        }

        let targetKey = null;

        snap.forEach(child => {
            const data = child.val();

            if (data.email === email) {
                targetKey = child.key;
            }
        });

        if (!targetKey) {
            return res.status(404).json({ message: "Email not found" });
        }

        // 🔥 UPDATE PASSWORD
        await set(ref(db, `voters/${targetKey}/password`), newPassword);

        delete otpStore[email];

        res.json({ message: "Password updated successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Update failed" });
    }
});

app.post("/api/account-approved-email", async (req, res) => {
    const { email, studentId, name } = req.body;

    try {
        await sendApprovedEmail(email, studentId, name);
        res.status(200).json({ message: "Approval email sent" });
    } catch (error) {
        res.status(500).json({ message: "Failed to send approval email" });
    }
});

app.post("/api/send-ballot-email", async (req, res) => {
    const { email, voterName, ballot } = req.body;

    try {
        await sendVotingReceipt(email, voterName, ballot);
        res.status(200).send("Receipt sent");
    } catch (err) {
        console.error("BALLOT EMAIL ERROR:", err);
        res.status(500).send(err.message);
    }
});

app.post("/api/success-email", async (req, res) => {
    const { email, studentId, password, voterNumber } = req.body;

    try {
        await successRegistered(email, studentId, voterNumber);
        res.status(200).json({ message: "Confirmation email sent" });
    } catch (error) {
        res.status(500).json({ message: "Failed to send confirmation" });
    }
});

app.post("/api/get-otp", async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    try {
        console.log("📨 Sending OTP to:", email);

        await sendEmailOTP(email, otp);

        console.log("✅ Email sent");

        res.status(200).json({ message: "OTP sent successfully" });

    } catch (error) {
        console.error("❌ Email error:", error);

        res.status(500).json({
            message: "Failed to send email",
            error: error.message
        });
    }
});

app.post("/api/delete-account", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email required" });
    }

    try {
        const votersRef = db.ref("voters");
        const snapshot = await votersRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ message: "No users found" });
        }

        let targetKey = null;

        snapshot.forEach(child => {
            const data = child.val();

            if (data.email === email) {
                targetKey = child.key;
            }
        });

        if (!targetKey) {
            return res.status(404).json({ message: "User not found" });
        }

        // 🔥 DELETE USER
        await db.ref(`voters/${targetKey}`).remove();

        return res.json({ message: "Account deleted successfully" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Delete failed" });
    }
});

app.post("/api/send-survey-email", async (req, res) => {
    const { email, voterName, survey } = req.body;

    if (!email || !survey) {
        return res.status(400).json({ message: "Missing data" });
    }

    // Mapping Shorthand Keys to Full Questions
    const questionMap = {
        q1: "Question 1: Overall Satisfaction",
        q2: "Question 2: Ease of Use",
        q3: "Question 3: Problems Encountered",
        q4: "Question 4: Confidence in Vote Recording",
        q5: "Question 5: System Speed",
        q6: "Question 6: Interface Clarity",
        q7: "Question 7: Trust in Accuracy",
        q8: "Question 8: Security Perception",
        q9: "Question 9: Future Usage Intent",
        q10: "Question 10: Recommendation Likelihood"
    };

    const surveyHTML = Object.entries(survey).map(([q, a]) => {
        // Fallback to the original key if it's not in our map
        const fullQuestion = questionMap[q] || q; 

        return `
            <div style="padding:14px; margin-bottom:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                <p style="margin:0; font-size:12px; font-weight:800; color:#3b82f6; text-transform:uppercase; letter-spacing:0.5px;">
                    ${fullQuestion}
                </p>
                <p style="margin:6px 0 0 0; font-size:16px; font-weight:bold; color:#1e293b;">
                    ${a}
                </p>
            </div>
        `;
    }).join("");

    try {
        const mailOptions = {
            from: '"BIT-CT VOTEHUB" <votehubbitct@gmail.com>',
            to: email, 
            subject: `Survey Response: ${voterName || "Anonymous Voter"}`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:600px; margin:auto; border:1px solid #e2e8f0; border-radius:24px; overflow:hidden; background-color: #fff;">
                    <div style="background:#2563eb; padding:30px; text-align:center;">
                        <h1 style="color:#fff; margin:0; font-size:24px; letter-spacing:-1px;">SURVEY FEEDBACK</h1>
                        <p style="color:#dbeafe; margin:5px 0 0 0; font-size:14px;">Official Voting System Experience Report</p>
                    </div>

                    <div style="padding:30px;">
                        <div style="margin-bottom:25px; padding-bottom:15px; border-bottom: 2px dashed #f1f5f9;">
                             <p style="font-size:15px; color:#64748b; margin:0;">
                                Voter Name: <strong style="color:#1e293b;">${voterName || "Anonymous"}</strong>
                            </p>
                        </div>

                        ${surveyHTML}

                        <div style="margin-top:30px; padding:20px; background:#f1f5f9; border-radius:12px; text-align:center;">
                            <p style="font-size:12px; color:#94a3b8; margin:0;">
                                <strong>BIT-CT VOTEHUB</strong><br>
                                This is an automated security and feedback record.
                            </p>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: "Survey sent successfully" });

    } catch (err) {
        console.error("SURVEY EMAIL ERROR:", err);
        res.status(500).json({ message: "Failed to send survey email" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
