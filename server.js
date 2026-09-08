const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

// Payment account configuration (public account identifiers only).
// Never put private keys, API secrets, or Binance/PayPal passwords in frontend code.
const PAYMENT_CONFIG = {
  binancePayId: process.env.BISZONE_BINANCE_PAY_ID || "1198424506",
  paypalEmail: process.env.BISZONE_PAYPAL_EMAIL || "edwinpkopus8246@gmail.com",
  cryptoStatus: "coming_soon"
};
const PORT = process.env.PORT || 3000;
const sessions = new Map();
const users = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, record) {
  const { hash } = hashPassword(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(record.hash, "hex"));
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expires: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  return token;
}
function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) return res.status(401).json({ error: "Authentication required" });
  const user = users.get(session.userId);
  if (!user) return res.status(401).json({ error: "Invalid session" });
  req.user = user;
  req.token = token;
  next();
}
function role(...roles) {
  return (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: "Insufficient permissions" });
}

app.get("/api/health", (_, res) => res.json({ ok: true, service: "Biszone" }));

app.get("/api/payments/config", (_, res) => {
  res.json({
    binancePayId: PAYMENT_CONFIG.binancePayId,
    paypalEmail: PAYMENT_CONFIG.paypalEmail,
    cryptoStatus: PAYMENT_CONFIG.cryptoStatus
  });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password, role: requestedRole } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const normalized = String(email).trim().toLowerCase();
  if (users.has(normalized)) return res.status(409).json({ error: "An account with that email already exists" });

  // Public registration can only create customer or vendor accounts.
  const accountRole = requestedRole === "vendor" ? "vendor" : "customer";
  const pw = hashPassword(password);
  const id = crypto.randomUUID();
  const user = { id, name: String(name).trim(), email: normalized, role: accountRole, ...pw, createdAt: new Date().toISOString() };
  users.set(normalized, user);

  const token = createSession(id);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const normalized = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = users.get(normalized);
  if (!user || !verifyPassword(password, user)) return res.status(401).json({ error: "Invalid email or password" });
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/logout", auth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/customer/dashboard", auth, role("customer"), (req, res) => {
  res.json({ message: `Welcome ${req.user.name}`, features: ["Orders", "Hotel bookings", "Event tickets", "Service bookings", "Saved items"] });
});

const vendorListings = new Map();

app.get("/api/vendor/dashboard", auth, role("vendor"), (req, res) => {
  const listings = vendorListings.get(req.user.id) || [];
  res.json({
    stats: { listings: listings.length, orders: 0, bookings: 0, revenue: 0 },
    listings, orders: [], bookings: []
  });
});

app.post("/api/vendor/listings", auth, role("vendor"), (req, res) => {
  const { type, name, description, price, availability } = req.body || {};
  if (!["product","service","hotel","event"].includes(type) || !name || price === undefined)
    return res.status(400).json({error:"Type, name and price are required"});
  const listing = {id:crypto.randomUUID(),vendorId:req.user.id,type,name:String(name).trim(),
    description:String(description||"").trim(),price:Number(price),
    availability:availability !== false,createdAt:new Date().toISOString()};
  const list=vendorListings.get(req.user.id)||[]; list.push(listing); vendorListings.set(req.user.id,list);
  res.status(201).json({listing});
});

app.patch("/api/vendor/listings/:id", auth, role("vendor"), (req,res)=>{
  const item=(vendorListings.get(req.user.id)||[]).find(x=>x.id===req.params.id);
  if(!item)return res.status(404).json({error:"Listing not found"});
  if(req.body.name!==undefined)item.name=String(req.body.name).trim();
  if(req.body.description!==undefined)item.description=String(req.body.description).trim();
  if(req.body.price!==undefined)item.price=Number(req.body.price);
  if(req.body.availability!==undefined)item.availability=!!req.body.availability;
  res.json({listing:item});
});

app.delete("/api/vendor/listings/:id", auth, role("vendor"), (req,res)=>{
  const list=vendorListings.get(req.user.id)||[], filtered=list.filter(x=>x.id!==req.params.id);
  if(filtered.length===list.length)return res.status(404).json({error:"Listing not found"});
  vendorListings.set(req.user.id,filtered); res.json({ok:true});
});

app.get("/api/admin/dashboard", auth, role("admin"), (req, res) => {
  const allUsers = [...users.values()].map(publicUser);
  const vendors = allUsers.filter(u => u.role === "vendor").map(v => ({ ...v, listings: (vendorListings.get(v.id) || []).length }));
  const listings = [...vendorListings.entries()].flatMap(([vendorId, items]) => items.map(x => ({ ...x, vendorEmail: allUsers.find(u => u.id === vendorId)?.email || "unknown" })));
  res.json({
    message: `Welcome ${req.user.name}`,
    stats: { users: allUsers.length, vendors: vendors.length, listings: listings.length, revenue: 0 },
    users: allUsers, vendors, listings, orders: [], bookings: [],
    features: ["Users", "Vendors", "Products", "Hotels", "Events", "Services", "Orders", "Bookings", "Payments", "Reports"]
  });
});

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

// Demo admin bootstrap. Change credentials before production.
const adminEmail = process.env.BISZONE_ADMIN_EMAIL || "admin@biszone.com";
if (!users.has(adminEmail)) {
  const pw = hashPassword(process.env.BISZONE_ADMIN_PASSWORD || "ChangeMe123!");
  users.set(adminEmail, { id: crypto.randomUUID(), name: "Biszone Admin", email: adminEmail, role: "admin", ...pw, createdAt: new Date().toISOString() });
}

app.listen(PORT, () => console.log(`Biszone running at http://localhost:${PORT}`));
