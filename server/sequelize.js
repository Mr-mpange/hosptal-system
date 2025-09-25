import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { Sequelize, DataTypes } from 'sequelize';

// Build Sequelize instance using same env as mysql pool
const passwordRaw = process.env.DB_PASSWORD;
const password = passwordRaw && passwordRaw.trim() !== '' ? passwordRaw : undefined;

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'clinicare',
  process.env.DB_USER || 'root',
  password,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
    dialectOptions: {},
    define: {
      // We manage explicit created_at columns, so disable automatic timestamps
      timestamps: false,
      underscored: false,
    },
  }
);

// Models container
export const models = {};

export async function initModels() {
  // User model aligns with existing API expectations
  models.User = sequelize.define('users', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM('patient','doctor','admin','laboratorist','manager'), allowNull: false, defaultValue: 'patient' },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'users' });

  // Patients
  models.Patient = sequelize.define('patients', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'patients' });

  // Appointments
  models.Appointment = sequelize.define('appointments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    doctor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    time: { type: DataTypes.STRING(8), allowNull: false },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'appointments' });

  // Medical Records
  models.MedicalRecord = sequelize.define('medical_records', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    record_type: { type: DataTypes.STRING(80), allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'medical_records' });

  // Invoices
  models.Invoice = sequelize.define('invoices', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('pending','paid','void'), allowNull: false, defaultValue: 'pending' },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'invoices' });

  // Notifications
  models.Notification = sequelize.define('notifications', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.STRING(1000), allowNull: false },
    target_role: { type: DataTypes.ENUM('all','patient','doctor','admin','laboratorist','manager'), allowNull: false, defaultValue: 'all' },
    created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // users.id
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'notifications' });

  // Departments
  models.Department = sequelize.define('departments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'departments' });

  // Wards (belong to department)
  models.Ward = sequelize.define('wards', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    department_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'wards' });

  // Beds (belong to ward)
  models.Bed = sequelize.define('beds', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    ward_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    label: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.ENUM('available','occupied','maintenance'), allowNull: false, defaultValue: 'available' },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'beds' });

  // Admissions (patient occupying a bed)
  models.Admission = sequelize.define('admissions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    bed_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    admitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    discharged_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
  }, { tableName: 'admissions' });

  // Inventory
  models.InventoryItem = sequelize.define('inventory_items', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    sku: { type: DataTypes.STRING(80), allowNull: true },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reorder_threshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(40), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'inventory_items' });

  // Staff (optionally linked to a user)
  models.Staff = sequelize.define('staff', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    role: { type: DataTypes.ENUM('doctor','nurse','support','admin','manager','laboratorist'), allowNull: false },
    department_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'staff' });

  // Shifts
  models.Shift = sequelize.define('shifts', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    staff_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    start_time: { type: DataTypes.STRING(8), allowNull: false },
    end_time: { type: DataTypes.STRING(8), allowNull: false },
    status: { type: DataTypes.ENUM('scheduled','completed','missed'), allowNull: false, defaultValue: 'scheduled' },
  }, { tableName: 'shifts' });

  // Attendance
  models.Attendance = sequelize.define('attendance', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    staff_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    clock_in: { type: DataTypes.STRING(8), allowNull: true },
    clock_out: { type: DataTypes.STRING(8), allowNull: true },
    status: { type: DataTypes.ENUM('present','absent','leave'), allowNull: false, defaultValue: 'present' },
  }, { tableName: 'attendance' });

  // Lab Results
  models.LabResult = sequelize.define('lab_results', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    test_type: { type: DataTypes.STRING(120), allowNull: false },
    value: { type: DataTypes.STRING(120), allowNull: true },
    unit: { type: DataTypes.STRING(40), allowNull: true },
    normal_range: { type: DataTypes.STRING(80), allowNull: true },
    flag: { type: DataTypes.ENUM('normal','abnormal','critical'), allowNull: false, defaultValue: 'normal' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'lab_results' });

  // Prescriptions (doctor -> patient)
  models.Prescription = sequelize.define('prescriptions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    doctor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    // Some MySQL versions do not allow DEFAULT CURRENT_DATE on DATE columns; set in app layer instead
    date: { type: DataTypes.DATEONLY, allowNull: false },
    diagnosis: { type: DataTypes.STRING(255), allowNull: true },
    medications: { type: DataTypes.TEXT, allowNull: true }, // JSON string of meds
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'prescriptions' });

  // Lab Orders (doctor requests)
  models.LabOrder = sequelize.define('lab_orders', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    doctor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tests: { type: DataTypes.TEXT, allowNull: true }, // JSON string list of tests
    status: { type: DataTypes.ENUM('requested','in_progress','completed','cancelled'), allowNull: false, defaultValue: 'requested' },
    requested_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: 'lab_orders' });

  // Doctor Availability
  models.Availability = sequelize.define('availability', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    doctor_user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // users.id for doctor
    date: { type: DataTypes.DATEONLY, allowNull: false },
    start_time: { type: DataTypes.STRING(8), allowNull: true },
    end_time: { type: DataTypes.STRING(8), allowNull: true },
    status: { type: DataTypes.ENUM('on','off'), allowNull: false, defaultValue: 'on' },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'availability' });

  // Branches
  models.Branch = sequelize.define('branches', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    address: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'branches' });

  // Services
  models.Service = sequelize.define('services', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    price: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'services' });

  // Templates (SMS/Email)
  models.Template = sequelize.define('templates', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.ENUM('sms','email'), allowNull: false },
    key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    subject: { type: DataTypes.STRING(200), allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'templates' });

  // Notifications Read (per-user read state)
  models.NotificationsRead = sequelize.define('notifications_read', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    notification_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'notifications_read', indexes: [ { unique: true, fields: ['user_id','notification_id'] } ] });

  // Payments (mock)
  models.Payment = sequelize.define('payments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    invoice_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    patient_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    method: { type: DataTypes.STRING(40), allowNull: true },
    status: { type: DataTypes.ENUM('initiated','success','failed'), allowNull: false, defaultValue: 'initiated' },
    reference: { type: DataTypes.STRING(160), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'payments' });

  // User 2FA (TOTP secret)
  models.User2FA = sequelize.define('user_2fa', {
    user_id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    totp_secret: { type: DataTypes.STRING(160), allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'user_2fa' });
  // Audit Logs
  models.AuditLog = sequelize.define('audit_logs', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    entity: { type: DataTypes.STRING(80), allowNull: false },
    entity_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    meta: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'audit_logs' });

  // Associations
  models.Patient.hasMany(models.Appointment, { foreignKey: 'patient_id' });
  models.Appointment.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Patient.hasMany(models.MedicalRecord, { foreignKey: 'patient_id' });
  models.MedicalRecord.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Patient.hasMany(models.Invoice, { foreignKey: 'patient_id' });
  models.Invoice.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  // New associations
  models.Department.hasMany(models.Ward, { foreignKey: 'department_id' });
  models.Ward.belongsTo(models.Department, { foreignKey: 'department_id' });

  models.Ward.hasMany(models.Bed, { foreignKey: 'ward_id' });
  models.Bed.belongsTo(models.Ward, { foreignKey: 'ward_id' });

  models.Patient.hasMany(models.Admission, { foreignKey: 'patient_id' });
  models.Admission.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Bed.hasMany(models.Admission, { foreignKey: 'bed_id' });
  models.Admission.belongsTo(models.Bed, { foreignKey: 'bed_id' });

  models.Department.hasMany(models.Staff, { foreignKey: 'department_id' });
  models.Staff.belongsTo(models.Department, { foreignKey: 'department_id' });

  models.Staff.hasMany(models.Shift, { foreignKey: 'staff_id' });
  models.Shift.belongsTo(models.Staff, { foreignKey: 'staff_id' });

  models.Staff.hasMany(models.Attendance, { foreignKey: 'staff_id' });
  models.Attendance.belongsTo(models.Staff, { foreignKey: 'staff_id' });

  models.Patient.hasMany(models.LabResult, { foreignKey: 'patient_id' });
  models.LabResult.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Patient.hasMany(models.Prescription, { foreignKey: 'patient_id' });
  models.Prescription.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Patient.hasMany(models.LabOrder, { foreignKey: 'patient_id' });
  models.LabOrder.belongsTo(models.Patient, { foreignKey: 'patient_id' });
}

export async function syncSequelize() {
  const alter = ['1','true','yes','on'].includes(String(process.env.DB_SYNC || '').toLowerCase());
  await sequelize.authenticate();
  // If DB_SYNC is true, sync with alter to create/adjust tables; else only ensure connection
  if (alter) {
    await sequelize.sync({ alter: true });
    console.log('[db] Sequelize sync complete (alter=true)');
  } else {
    await sequelize.sync();
    console.log('[db] Sequelize sync complete');
  }
}
