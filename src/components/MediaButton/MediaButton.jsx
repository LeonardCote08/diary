import { createSignal, Show } from 'solid-js';
import './MediaButton.css';

/**
 * MediaButton - Button to reveal image overlays
 * Shows "View Photo" on desktop, "Show Photo" on mobile
 */
function MediaButton(props) {
    const {
        hotspotId,
        onClick,
        isVisible = true,
        position = { x: 0, y: 0 },
        isMobile = false
    } = props;
    
    const [isHovered, setIsHovered] = createSignal(false);
    const [isClicked, setIsClicked] = createSignal(false);
    
    // Button text based on platform
    const buttonText = () => isMobile ? 'Show Photo' : 'View Photo';
    
    // Handle click with animation
    const handleClick = (e) => {
        e.stopPropagation();
        setIsClicked(true);
        
        if (onClick) {
            onClick(hotspotId);
        }
        
        // Reset clicked state after animation
        setTimeout(() => setIsClicked(false), 300);
    };
    
    return (
        <Show when={isVisible}>
            <div 
                class={`media-button-container ${isMobile ? 'mobile' : 'desktop'}`}
                
            >
                <button
                    class={`media-button ${isHovered() ? 'hovered' : ''} ${isClicked() ? 'clicked' : ''}`}
                    onClick={handleClick}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    title={buttonText()}
                >
                    <svg 
                        class="media-button-icon" 
                        width="16" 
                        height="16" 
                        viewBox="0 0 16 16" 
                        fill="none"
                    >
                        <path 
                            d="M2 4C2 2.89543 2.89543 2 4 2H12C13.1046 2 14 2.89543 14 4V12C14 13.1046 13.1046 14 12 14H4C2.89543 14 2 13.1046 2 12V4Z" 
                            stroke="currentColor" 
                            stroke-width="1.5"
                        />
                        <circle 
                            cx="8" 
                            cy="8" 
                            r="2.5" 
                            stroke="currentColor" 
                            stroke-width="1.5"
                        />
                        <path 
                            d="M2 11L5 8L7 10L10 7L14 11" 
                            stroke="currentColor" 
                            stroke-width="1.5" 
                            stroke-linecap="round" 
                            stroke-linejoin="round"
                        />
                    </svg>
                    <span class="media-button-text">{buttonText()}</span>
                </button>
            </div>
        </Show>
    );
}

export default MediaButton;