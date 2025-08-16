const mongoose = require('mongoose');

const cotizacionSchema = new mongoose.Schema({
    ordenServicio: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrdenServicio',
        required: true
    },
    manoDeObra: {
        descripcion: {
            type: String,
            required: true,
            trim: true
        },
        horas: {
            type: Number,
            required: true,
            min: 0
        },
        precioPorHora: {
            type: Number,
            required: true,
            min: 0
        },
        subtotal: {
            type: Number,
            required: true,
            min: 0
        }
    },
    itemsInventario: [{
        inventarioItem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InventarioItem',
            required: true
        },
        cantidad: {
            type: Number,
            required: true,
            min: 1
        },
        precioUnitario: {
            type: Number,
            required: true,
            min: 0
        },
        subtotal: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    subtotalManoObra: {
        type: Number,
        required: true,
        min: 0
    },
    subtotalMateriales: {
        type: Number,
        required: true,
        min: 0
    },
    descuento: {
        type: Number,
        required: false,
        min: 0,
        default: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    estado: {
        type: String,
        required: true,
        enum: ['pendiente', 'aprobada', 'rechazada', 'cancelada'],
        default: 'pendiente'
    },
    observaciones: {
        type: String,
        required: false,
        trim: true
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
    },
    fechaAprobacion: {
        type: Date,
        required: false
    },
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    aprobadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Método para calcular subtotal de materiales
cotizacionSchema.methods.calcularSubtotalMateriales = function() {
    return this.itemsInventario.reduce((total, item) => total + item.subtotal, 0);
};

// Método para calcular total
cotizacionSchema.methods.calcularTotal = function() {
    const subtotalMateriales = this.calcularSubtotalMateriales();
    return this.subtotalManoObra + subtotalMateriales - this.descuento;
};

// Virtual para verificar si está pendiente de aprobación
cotizacionSchema.virtual('pendienteAprobacion').get(function() {
    return this.estado === 'pendiente';
});

// Asegurar que se incluya en JSON
cotizacionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Cotizacion', cotizacionSchema);