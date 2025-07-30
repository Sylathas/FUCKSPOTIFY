import { useState, useEffect } from 'react'

interface PlatformSelectorSectionProps {
    isMobile: boolean
    selectedPlatform: string | null
    onSelectPlatform: (platform: string | null) => void
}

export default function PlatformSelectorSection({
    isMobile,
    selectedPlatform,
    onSelectPlatform
}: PlatformSelectorSectionProps) {
    const [isCheckingTidalAuth, setIsCheckingTidalAuth] = useState(true)
    const [isTidalLoggedIn, setIsTidalLoggedIn] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [tidalLoginError, setTidalLoginError] = useState<string | null>(null);

    const platforms = [
        { name: 'APPLE MUSIC', image: '/Buttons/Apple.png', implemented: false },
        { name: 'SOUNDCLOUD', image: '/Buttons/Soundcloud.png', implemented: false },
        { name: 'TIDAL', image: '/Buttons/Tidal.png', implemented: true },
        { name: 'YOUTUBE MUSIC', image: '/Buttons/YT.png', implemented: false },
        { name: 'BANDCAMP', image: '/Buttons/Bandcamp.png', implemented: true }
    ]

    const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000'

    // Enhanced mobile-friendly Tidal login
    const handleTidalLogin = async () => {
        setIsLoggingIn(true);
        setTidalLoginError(null);

        try {
            console.log('Starting Tidal login...');

            // 1. Get the login URL from our backend
            const res = await fetch(`${BACKEND_API_URL}/api/tidal/initiate-login`);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const { login_url, poll_key } = await res.json();
            console.log('Got Tidal login URL and poll key');

            // 2. Open the login page - mobile-friendly approach
            if (isMobile) {
                // On mobile, store poll key and open in same tab
                localStorage.setItem('tidal_login_poll_key', poll_key);
                localStorage.setItem('tidal_login_started', 'true');

                // Open Tidal login in same tab
                window.location.href = login_url;
                return; // Exit early on mobile
            } else {
                // Desktop: try popup first
                const width = 600;
                const height = 700;
                const left = (window.screen.width / 2) - (width / 2);
                const top = (window.screen.height / 2) - (height / 2);
                const features = `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`;

                const popup = window.open(login_url, 'TidalLogin', features);

                if (!popup) {
                    // Fallback to same tab if popup blocked
                    localStorage.setItem('tidal_login_poll_key', poll_key);
                    localStorage.setItem('tidal_login_started', 'true');
                    window.location.href = login_url;
                    return;
                }
            }

            // 3. Poll our backend to see if the user has finished (desktop only)
            const pollInterval = setInterval(async () => {
                try {
                    const verifyRes = await fetch(`${BACKEND_API_URL}/api/tidal/verify-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ poll_key: poll_key }),
                    });

                    if (!verifyRes.ok) {
                        throw new Error(`Verification failed: ${verifyRes.status}`);
                    }

                    const verifyData = await verifyRes.json();

                    if (verifyData.status === 'completed') {
                        clearInterval(pollInterval);
                        localStorage.setItem('tidal_access_token', verifyData.access_token);
                        localStorage.removeItem('tidal_login_poll_key');
                        localStorage.removeItem('tidal_login_started');
                        setIsTidalLoggedIn(true);
                        setIsLoggingIn(false);
                        console.log('Tidal login successful!');
                    } else if (verifyData.status === 'failed') {
                        clearInterval(pollInterval);
                        setTidalLoginError('Tidal login failed');
                        setIsLoggingIn(false);
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                    clearInterval(pollInterval);
                    setTidalLoginError('Login verification failed');
                    setIsLoggingIn(false);
                }
            }, 3000);

            // Stop polling after 5 minutes
            setTimeout(() => {
                clearInterval(pollInterval);
                if (isLoggingIn) {
                    setTidalLoginError('Login timeout - please try again');
                    setIsLoggingIn(false);
                }
            }, 300000);

        } catch (error) {
            console.error("Tidal login failed", error);
            setTidalLoginError(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setIsLoggingIn(false);
        }
    };

    const handleTidalLogout = async () => {
        localStorage.removeItem('tidal_access_token');
        localStorage.removeItem('tidal_login_poll_key');
        localStorage.removeItem('tidal_login_started');
        setIsTidalLoggedIn(false);
        setTidalLoginError(null);

        // If Tidal was selected, deselect it
        if (selectedPlatform === 'TIDAL') {
            onSelectPlatform(null);
        }
    };

    // Check for mobile login resume and existing tokens
    useEffect(() => {
        const checkAuth = async () => {
            // Check for existing token
            const token = localStorage.getItem('tidal_access_token');
            if (token) {
                setIsTidalLoggedIn(true);
                setIsCheckingTidalAuth(false);
                return;
            }

            // Check for mobile login resume
            const savedPollKey = localStorage.getItem('tidal_login_poll_key');
            const loginStarted = localStorage.getItem('tidal_login_started');

            if (savedPollKey && loginStarted && isMobile) {
                console.log('Resuming mobile Tidal login...');
                setIsLoggingIn(true);

                // Start polling with saved poll key
                const pollInterval = setInterval(async () => {
                    try {
                        const verifyRes = await fetch(`${BACKEND_API_URL}/api/tidal/verify-login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ poll_key: savedPollKey }),
                        });

                        const verifyData = await verifyRes.json();

                        if (verifyData.status === 'completed') {
                            clearInterval(pollInterval);
                            localStorage.setItem('tidal_access_token', verifyData.access_token);
                            localStorage.removeItem('tidal_login_poll_key');
                            localStorage.removeItem('tidal_login_started');
                            setIsTidalLoggedIn(true);
                            setIsLoggingIn(false);
                            console.log('Mobile Tidal login completed!');
                        } else if (verifyData.status === 'failed') {
                            clearInterval(pollInterval);
                            localStorage.removeItem('tidal_login_poll_key');
                            localStorage.removeItem('tidal_login_started');
                            setTidalLoginError('Tidal login failed');
                            setIsLoggingIn(false);
                        }
                    } catch (error) {
                        console.error('Mobile polling error:', error);
                        clearInterval(pollInterval);
                        localStorage.removeItem('tidal_login_poll_key');
                        localStorage.removeItem('tidal_login_started');
                        setTidalLoginError('Login verification failed');
                        setIsLoggingIn(false);
                    }
                }, 2000);

                // Cleanup polling after 5 minutes
                setTimeout(() => {
                    clearInterval(pollInterval);
                    if (isLoggingIn) {
                        localStorage.removeItem('tidal_login_poll_key');
                        localStorage.removeItem('tidal_login_started');
                        setTidalLoginError('Login timeout');
                        setIsLoggingIn(false);
                    }
                }, 300000);
            }

            setIsCheckingTidalAuth(false);
        };

        checkAuth();
    }, [isMobile, BACKEND_API_URL, isLoggingIn]);

    // Helper function to check if a platform is logged in
    const isPlatformLoggedIn = (platformName: string): boolean => {
        switch (platformName) {
            case 'TIDAL':
                return isTidalLoggedIn;
            case 'BANDCAMP':
                return true; // Bandcamp doesn't need login
            default:
                return false;
        }
    };

    // Helper function to get the correct image source
    const getImageSource = (platform: any): string => {
        const isSelected = selectedPlatform === platform.name;

        if (isSelected && platform.implemented) {
            const extension = platform.image.split('.').pop();
            const baseName = platform.image.replace(`.${extension}`, '');
            return `${baseName}_Selected.${extension}`;
        }

        return platform.image;
    };

    // Helper function to handle platform selection
    const handlePlatformSelect = (platformName: string) => {
        const platform = platforms.find(p => p.name === platformName);

        if (!platform?.implemented) {
            alert(`${platformName} integration coming soon!`);
            return;
        }

        if (!isPlatformLoggedIn(platformName)) {
            alert(`Please login to ${platformName} first!`);
            return;
        }

        // Toggle selection
        if (selectedPlatform === platformName) {
            onSelectPlatform(null);
        } else {
            onSelectPlatform(platformName);
        }
    };

    // Helper function to handle login for different platforms
    const handlePlatformLogin = (platformName: string) => {
        switch (platformName) {
            case 'TIDAL':
                handleTidalLogin();
                break;
            default:
                alert(`${platformName} login not implemented yet`);
        }
    };

    // Helper function to handle logout for different platforms
    const handlePlatformLogout = (platformName: string) => {
        switch (platformName) {
            case 'TIDAL':
                handleTidalLogout();
                break;
            default:
                alert(`${platformName} logout not implemented yet`);
        }
    };

    const renderPlatformButtons = (platform: any) => {
        const isSelected = selectedPlatform === platform.name;
        const isLoggedIn = isPlatformLoggedIn(platform.name);
        const imageSrc = getImageSource(platform);

        // Case 1: Platform not implemented
        if (!platform.implemented) {
            return (
                <div key={platform.name} className="relative">
                    <img
                        src={imageSrc}
                        alt={platform.name}
                        className={`
                            w-full h-auto opacity-50 cursor-not-allowed
                            ${isMobile ? 'max-h-9' : 'max-h-10'}
                        `}
                        title={`${platform.name} - Coming Soon`}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-white bg-black bg-opacity-75 px-1 rounded">
                            Soon
                        </span>
                    </div>
                </div>
            );
        }

        // Case 2: Platform implemented but not logged in
        if (!isLoggedIn) {
            const isLoading = platform.name === 'TIDAL' && isLoggingIn;

            return (
                <div key={platform.name} className="relative">
                    <img
                        src={imageSrc}
                        alt={platform.name}
                        onClick={isLoading ? undefined : () => handlePlatformLogin(platform.name)}
                        className={`
                            w-full h-auto transition-all
                            ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:brightness-110 hover:scale-102'}
                            ${isMobile ? 'max-h-9' : 'max-h-10'}
                        `}
                        title={isLoading ? 'Waiting for authorization...' : `Click to login to ${platform.name}`}
                    />
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs text-white bg-black bg-opacity-75 px-1 rounded">
                                {isMobile ? 'Complete login in Tidal...' : 'Logging in...'}
                            </span>
                        </div>
                    )}
                </div>
            );
        }

        // Case 3: Platform implemented and logged in - Show two buttons side by side
        return (
            <div key={platform.name} className="flex space-x-1">
                {/* Select/Deselect Button */}
                <div className="flex-1">
                    <img
                        src={imageSrc}
                        alt={`Select ${platform.name}`}
                        onClick={() => handlePlatformSelect(platform.name)}
                        className={`
                            w-full h-auto cursor-pointer transition-all
                            ${isSelected
                                ? 'brightness-125 scale-105'
                                : 'hover:brightness-110 hover:scale-102'
                            }
                            ${isMobile ? 'max-h-9' : 'max-h-10'}
                        `}
                        title={isSelected ? `Deselect ${platform.name}` : `Select ${platform.name}`}
                    />
                </div>

                {/* Logout Button - only for platforms that need it */}
                {platform.name !== "BANDCAMP" && (
                    <div className="flex-1">
                        <img
                            src="/Buttons/Logout.png"
                            alt={`Logout from ${platform.name}`}
                            onClick={() => handlePlatformLogout(platform.name)}
                            className={`
                                h-auto cursor-pointer transition-all hover:brightness-110 hover:scale-102
                                ${isMobile ? 'max-h-9' : 'max-h-10'}
                            `}
                            title={`Logout from ${platform.name}`}
                            style={{ width: 'auto' }}
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            className={`
                relative bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center p-4
                ${isMobile ? 'h-[300px]' : 'h-[100%]'}
            `}
            style={{
                backgroundImage: "url('/Buttons/UI_Background.png')",
                backgroundSize: '100% 100%'
            }}
        >
            {/* Error message for Tidal login */}
            {tidalLoginError && (
                <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-xs p-2 text-center z-10">
                    {tidalLoginError}
                    <button
                        onClick={() => setTidalLoginError(null)}
                        className="ml-2 text-red-200 hover:text-white"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Mobile instruction banner */}
            {isLoggingIn && isMobile && (
                <div className="absolute top-8 left-0 right-0 bg-blue-600 text-white text-xs p-2 text-center z-10">
                    Return here after completing Tidal authorization
                </div>
            )}

            {/* Platform buttons */}
            <div className="flex-1 flex flex-col justify-center space-y-2 w-full">
                {platforms.map(platform => renderPlatformButtons(platform))}
            </div>

            {/* Status indicator for initial auth check */}
            {isCheckingTidalAuth && (
                <div className="absolute bottom-2 right-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                </div>
            )}
        </div>
    )
}