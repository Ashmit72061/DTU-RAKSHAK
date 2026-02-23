import { Menu } from 'lucide-react';

export default function MobileHeader({ onToggleSidebar }) {
    return (
        <header className="mobile-header">
            <div className="mobile-header-brand">
                <img src="/dtu-logo.png" alt="DTU" />
                <span>DTU Rakshak</span>
            </div>
            <button
                className="hamburger-btn"
                onClick={onToggleSidebar}
                aria-label="Open sidebar"
            >
                <Menu size={22} />
            </button>
        </header>
    );
}
