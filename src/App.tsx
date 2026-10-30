/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingScreen } from './components/LoadingScreen';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { WatchtowerPage } from './pages/WatchtowerPage';
import { ScrollPage } from './pages/ScrollPage';
import { SpiritLensPage } from './pages/SpiritLensPage';
import { DojoPage } from './pages/DojoPage';
import { HonorPage } from './pages/HonorPage';
import { StarGazerPage } from './pages/StarGazerPage';
import { RestorationProvider } from './utils/restorationContext';
import { isCalmMode } from './utils/calmMode';

const INTRO_KEY = 'tsukuyomi_intro_seen';

function shouldShowIntro(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCalmMode()) return false;
  if (window.location.pathname !== '/') return false;
  try {
    return sessionStorage.getItem(INTRO_KEY) !== '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [showIntro, setShowIntro] = useState<boolean>(shouldShowIntro);

  return (
    <BrowserRouter>
      <RestorationProvider>
        {showIntro && (
          <LoadingScreen
            onLoadingComplete={() => {
              try {
                sessionStorage.setItem(INTRO_KEY, '1');
              } catch {
                /* ignore */
              }
              setShowIntro(false);
            }}
          />
        )}
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/watchtower" element={<WatchtowerPage />} />
            <Route path="/scroll" element={<ScrollPage />} />
            <Route path="/lens" element={<SpiritLensPage />} />
            <Route path="/dojo" element={<DojoPage />} />
            <Route path="/honor" element={<HonorPage />} />
            <Route path="/stargazer" element={<StarGazerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </RestorationProvider>
    </BrowserRouter>
  );
}
