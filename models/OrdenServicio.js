const mongoose = require('mongoose');

const ordenServicioSchema = new mongoose.Schema({
    dispositivo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dispositivo',
        required: true
    },
    tipoServicio: {
        type: String,
        required: true,
        enum: ['reparacion', 'mantenimiento', 'instalacion'],
        trim: true
    },
    estado: {
        type: String,
        required: true,
        enum: ['pendiente', 'asignada', 'cotizacion_enviada', 'aprobada', 'rechazada', 'cancelada', 'en_proceso', 'finalizada'],
        default: 'pendiente'
    },
    tecnicoAsignado: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    prioridad: {
        type: String,
        required: false,
        enum: ['baja', 'media', 'alta', 'urgente'],
        default: 'media'
    },
    diagnosticoInicial: {
        type: String,
        required: false,
        trim: true
    },
    trabajoRealizado: {
        type: String,
        required: false,
        trim: true
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
    fechaAsignacion: {
        type: Date,
        required: false
    },
    fechaInicio: {
        type: Date,
        required: false
    },
    fechaFinalizacion: {
        type: Date,
        required: false
    },
    fechaEntrega: {
        type: Date,
        required: false
    },
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    montoPagado: {
        type: Number,
        default: 0,
        min: 0
    },
    estadoPago: {
        type: String,
        enum: ['no_pagada', 'parcial', 'pagada'],
        default: 'no_pagada'
    }
}, {
    timestamps: true
});

// Método para obtener duración del servicio
ordenServicioSchema.virtual('duracionServicio').get(function() {
    if (this.fechaInicio && this.fechaFinalizacion) {
        const diff = this.fechaFinalizacion - this.fechaInicio;
        return Math.ceil(diff / (1000 * 60 * 60 * 24)); // días
    }
    return null;
});

// Método para verificar si está en proceso
ordenServicioSchema.virtual('enProceso').get(function() {
    return ['asignada', 'cotizacion_enviada', 'aprobada', 'en_proceso'].includes(this.estado);
});

// Método para actualizar estado de pago
ordenServicioSchema.methods.actualizarEstadoPago = async function() {
    const Cotizacion = require('./Cotizacion');
    const cotizacionAprobada = await Cotizacion.findOne({
        ordenServicio: this._id,
        estado: 'aprobada'
    });
    if (!cotizacionAprobada) {
        this.estadoPago = 'no_pagada';
        return;
    }
    const total = cotizacionAprobada.total;
    if (this.montoPagado === 0) {
        this.estadoPago = 'no_pagada';
    } else if (this.montoPagado < total) {
        this.estadoPago = 'parcial';
    } else {
        this.estadoPago = 'pagada';
    }
};

// Asegurar que se incluya en JSON
ordenServicioSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('OrdenServicio', ordenServicioSchema);