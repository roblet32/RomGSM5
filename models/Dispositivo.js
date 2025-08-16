const mongoose = require('mongoose');

const dispositivoSchema = new mongoose.Schema({
    cliente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        required: true
    },
    tipo: {
        type: String,
        required: true,
        enum: ['computadora', 'laptop', 'impresora', 'tablet', 'smartphone', 'monitor', 'otro'],
        trim: true
    },
    marca: {
        type: String,
        required: true,
        trim: true
    },
    modelo: {
        type: String,
        required: true,
        trim: true
    },
    numeroSerie: {
        type: String,
        required: false,
        trim: true
    },
    descripcionProblema: {
        type: String,
        required: true,
        trim: true
    },
    fotos: [{
        type: String, // Ruta del archivo de foto
        required: false
    }],
    accesoriosIncluidos: {
        type: String,
        required: false,
        trim: true
    },
    fechaIngreso: {
        type: Date,
        default: Date.now
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Método para obtener descripción completa del dispositivo
dispositivoSchema.virtual('descripcionCompleta').get(function() {
    return `${this.marca} ${this.modelo} (${this.tipo})`;
});

// Asegurar que se incluya en JSON
dispositivoSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Dispositivo', dispositivoSchema);