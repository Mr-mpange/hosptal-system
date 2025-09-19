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
    role: { type: DataTypes.ENUM('patient','doctor','admin'), allowNull: false, defaultValue: 'patient' },
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
    notes: { type: DataTypes.STRING(500), allowNull: true },
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

  // Associations
  models.Patient.hasMany(models.Appointment, { foreignKey: 'patient_id' });
  models.Appointment.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Patient.hasMany(models.MedicalRecord, { foreignKey: 'patient_id' });
  models.MedicalRecord.belongsTo(models.Patient, { foreignKey: 'patient_id' });

  models.Patient.hasMany(models.Invoice, { foreignKey: 'patient_id' });
  models.Invoice.belongsTo(models.Patient, { foreignKey: 'patient_id' });
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
