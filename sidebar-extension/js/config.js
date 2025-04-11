// Environment configuration
const config = {
    development: {
        apiUrl: 'http://localhost:3101',
        appUrl: 'http://localhost:5173',
        authUrl: 'http://localhost:8181'
    },
    production: {
        apiUrl: 'https://api.spacewh.ai',
        appUrl: 'https://app.spacewh.ai',
        authUrl: 'https://auth.spacewh.ai'
    }
};

const environment = process.env.NODE_ENV || 'development';
export default config[environment];