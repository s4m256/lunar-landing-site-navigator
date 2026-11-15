import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppLoader } from './AppLoader';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppLoader /></React.StrictMode>);
