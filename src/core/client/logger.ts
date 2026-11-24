import { createLogger, format, transports, addColors } from 'winston';

const { combine, timestamp, printf, colorize } = format;

// Define colores personalizados para cada nivel de log
const customColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    debug: 'magenta',
};

// Agregar colores personalizados a winston
addColors(customColors);

// Formato personalizado para los logs
const logFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] [${level}] ${message}`;
});

// Rotación de los archivos: al llegar a 5 MB se pasa al siguiente y se conservan los 3 últimos
const rotation = { maxsize: 5 * 1024 * 1024, maxFiles: 3, tailable: true };

// Configuración del logger
const logger = createLogger({
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
    },
    level: "debug", // Cambia a 'info' en producción si quieres menos detalles
    format: combine(
        timestamp({ format: 'DD-MM-YYYY HH:mm' }), // " HH:mm:ss " para incluir segundos
        logFormat
    ),
    transports: [
        // Colores solo en la consola: en los archivos quedarían como códigos ESC[35m...ESC[39m
        new transports.Console({ format: combine(colorize({ all: true }), logFormat) }),
        new transports.File({ filename: 'logs/error.log', level: 'error', ...rotation }), // Solo errores
        new transports.File({ filename: 'logs/combined.log', ...rotation }), // Todos los niveles
    ],
});

// Exporta el logger para usarlo en otras partes del proyecto
export default logger;
