import { Show } from 'solid-js';

/**
 * ModalOverlay - Modal display mode for image overlay
 */
function ModalOverlay(props) {
    const { imageUrl, isVisible, onClose, hotspotTitle } = props;


    const handleBackdropClick = (e) => {
        // Close only if clicking the backdrop, not the image
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <Show when={isVisible}>
            <div class="modal-overlay-backdrop" onClick={handleBackdropClick}>
                <div class={`modal-overlay-content ${props.isLoading ? 'loading' : ''} ${props.hasError ? 'error' : ''}`}>
                    <button class="modal-close-button" onClick={onClose} title="Close (Esc)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                    </button>

                    <Show when={hotspotTitle}>
                        <h3 class="modal-title">{hotspotTitle}</h3>
                    </Show>

                    <div class="modal-image-container">
                        <img
                            src={imageUrl}
                            alt={hotspotTitle || 'Hotspot image'}
                            class="modal-image"
                            loading="lazy"
                        />
                    </div>
                </div>
            </div>
        </Show>
    );
}

export default ModalOverlay;