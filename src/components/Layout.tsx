import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

export const Layout: React.FC = () => {
  const { pathname } = useLocation();

  // New page = start at the top (the old single-page layout never needed this)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    const names: Record<string, string> = {
      '/': 'Home',
      '/watchtower': 'The Watchtower',
      '/scroll': 'The Celestial Scroll',
      '/lens': 'The Spirit Lens',
      '/dojo': 'The Dojo Dashboard',
      '/honor': 'Honor Points',
    };
    const name = names[pathname];
    document.title = name ? `${name} · Tsukuyomi Watch` : "Tsukuyomi Watch: The Samurai's Celestial Guide";
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0F] text-[#F4EFE3] selection:bg-[#B3202A] selection:text-[#F4EFE3] overflow-x-hidden relative">
      <Navbar />
      <main className="flex-1 pt-14">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};
