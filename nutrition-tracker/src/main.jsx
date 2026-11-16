import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { seedFoods } from './lib/store.js';
import { Cloud } from './lib/supabaseClient.js';
import { seedExercises } from './lib/workouts.js';

seedFoods();
seedExercises();
Cloud.start();
createRoot(document.getElementById('root')).render(<App />);
