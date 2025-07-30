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

    const platforms = [
        { name: 'APPLE MUSIC', image: '/Buttons/Apple.png', implemented: false },
        { name: 'SOUNDCLOUD', image: '/Buttons/Soundcloud.png', implemented: false },
        { name: 'TIDAL', image: '/Buttons/Tidal.png', implemented: true },
        { name: 'YOUTUBE MUSIC', image: '/Buttons/YT.png', implemented: false },
        { name: 'BANDCAMP', image: '/Buttons/Bandcamp.png', implemented: true }
    ]

    const handleTidalLogin = async () => {
        setIsLoggingIn(true);
        try {
            // 1. Get the login URL from our backend
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/tidal/initiate-login`);
            const { login_url, poll_key } = await res.json();

            // 2. Open the login page for the user
            const width = 600;
            const height = 700;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            const features = `width=${width},height=${height},top=${top},left=${left}`;

            window.open(login_url, 'TidalLogin', features);

            // 3. Poll our backend to see if the user has finished
            const pollInterval = setInterval(async () => {
                const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/tidal/verify-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ poll_key: poll_key }),
                });
                const verifyData = await verifyRes.json();

                if (verifyData.status === 'completed') {
                    clearInterval(pollInterval);
                    localStorage.setItem('tidal_access_token', verifyData.access_token);
                    setIsTidalLoggedIn(true);
                    setIsLoggingIn(false);
                    // Don't auto-select platform after login - let user choose
                }
            }, 3000);

        } catch (error) {
            console.error("Tidal login failed", error);
            alert("Tidal login failed. Please try again.");
            setIsLoggingIn(false);
        }
    };

    const handleTidalLogout = async () => {
        localStorage.removeItem('tidal_access_token');
        setIsTidalLoggedIn(false);
        // If Tidal was selected, deselect it
        if (selectedPlatform === 'TIDAL') {
            onSelectPlatform(null);
        }
    };

    // On component load, check if we already have a token in localStorage
    useEffect(() => {
        const token = localStorage.getItem('tidal_access_token');
        if (token) {
            setIsTidalLoggedIn(true);
        }
        setIsCheckingTidalAuth(false);
    }, []);

    // Helper function to check if a platform is logged in
    const isPlatformLoggedIn = (platformName: string): boolean => {
        switch (platformName) {
            case 'TIDAL':
                return isTidalLoggedIn;
            case 'BANDCAMP':
                // Add Bandcamp login check here when implemented
                return true; // Assuming Bandcamp doesn't need login for now
            default:
                return false;
        }
    };

    // Helper function to get the correct image source
    const getImageSource = (platform: any): string => {
        const isSelected = selectedPlatform === platform.name;

        if (isSelected && platform.implemented) {
            // Use the *Selected variant for selected platforms
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

        // Toggle selection: if already selected, deselect; otherwise select
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
            // Add other platform login handlers here
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
            // Add other platform logout handlers here
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
                                Logging in...
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

                {/* Logout Button */}

                {platform.name !== "BANDCAMP" && (
                    <div className="flex-shrink-0">
                        <img
                            src="/Buttons/Logout.png"
                            alt={`Logout from ${platform.name}`}
                            onClick={() => handlePlatformLogout(platform.name)}
                            className={`
                h-auto cursor-pointer transition-all hover:brightness-110 hover:scale-102
                ${isMobile ? 'max-h-9' : 'max-h-10'}
            `}
                            title={`Logout from ${platform.name}`}
                            style={{ width: 'auto' }} // Let width adjust to maintain aspect ratio
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