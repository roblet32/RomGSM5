const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        unique: true, 
        required: true,
        trim: true,
        lowercase: true
    },
    password: { 
        type: String, 
        required: true 
    },
    role: {
        type: String,
        enum: ['admin', 'tecnico', 'recepcion'],
        required: true,
        default: 'tecnico'
    },
    permissions: [String], // lista de permisos como texto
    nombre: {
        type: String,
        required: false,
        trim: true
    },
    email: {
        type: String,
        required: false,
        trim: true,
        lowercase: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
    },
    ultimoAcceso: {
        type: Date,
        required: false
    },
    intentosLogin: {
        type: Number,
        default: 0
    },
    bloqueadoHasta: {
        type: Date,
        required: false
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();

    try {
        // Hash password with salt rounds from environment
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        this.password = await bcrypt.hash(this.password, saltRounds);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
    if (!this.bloqueadoHasta) return false;
    return new Date() < this.bloqueadoHasta;
};

// Method to increment login attempts
userSchema.methods.incrementLoginAttempts = async function() {
    this.intentosLogin += 1;
    
    // Lock account after 5 failed attempts for 15 minutes
    if (this.intentosLogin >= 5) {
        this.bloqueadoHasta = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }
    
    await this.save();
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = async function() {
    this.intentosLogin = 0;
    this.bloqueadoHasta = null;
    await this.save();
};

// Método para verificar si tiene un permiso específico
userSchema.methods.tienePermiso = function(permiso) {
    return this.permissions.includes(permiso);
};

// Método para verificar si es admin
userSchema.methods.esAdmin = function() {
    return this.role === 'admin';
};

// Método para verificar si es técnico
userSchema.methods.esTecnico = function() {
    return this.role === 'tecnico';
};

// Método para verificar si es recepcionista
userSchema.methods.esRecepcionista = function() {
    return this.role === 'recepcion';
};

// Virtual para obtener nombre de display
userSchema.virtual('nombreDisplay').get(function() {
    return this.nombre || this.username;
});

// Virtual para verificar si la cuenta está activa
userSchema.virtual('cuentaActiva').get(function() {
    return this.activo && !this.isLocked();
});

// Asegurar que se incluya en JSON
userSchema.set('toJSON', { 
    virtuals: true,
    transform: function(doc, ret) {
        delete ret.password; // Never send password in JSON
        return ret;
    }
});

module.exports = mongoose.model('User', userSchema);