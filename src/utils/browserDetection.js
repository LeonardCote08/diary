/**
 * Browser detection utilities for optimal renderer selection
 */

export const getBrowserOptimalDrawer = () => {
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

    // Check if device is mobile (including Android)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);

    // CRITICAL FIX: Force canvas for ALL mobile devices and Safari
    // OpenSeadragon 5.0+ has severe WebGL performance issues on mobile
    if (isMobile || isSafari || isIOS) {
        console.log('Mobile/Safari detected - forcing canvas drawer for performance');
        return 'canvas';
    }

    // Desktop Chrome/Firefox can use WebGL effectively
    const isChrome = /chrome|crios/i.test(ua) && !/edge|edg/i.test(ua);
    const isFirefox = /firefox|fxios/i.test(ua);

    if (isChrome || isFirefox) {
        console.log('Desktop Chrome/Firefox detected - using webgl drawer');
        return 'webgl';
    }

    // Default to canvas for all other cases
    console.log('Default browser detected - using canvas drawer');
    return 'canvas';
};

export const isMobile = () => {
    // More accurate mobile detection
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

    // Check user agent first
    if (mobileRegex.test(userAgent)) {
        return true;
    }

    // Then check screen size AND touch capability
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 768;

    // Only consider it mobile if BOTH conditions are true
    return hasTouch && isSmallScreen;
};