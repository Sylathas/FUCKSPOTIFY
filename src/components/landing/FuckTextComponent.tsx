interface FuckTextComponentProps {
    isMobile: boolean
}

export default function FuckTextComponent({ isMobile }: FuckTextComponentProps) {
    return (
        <img
            src="/FuckText.png"
            alt="Fuck This Guy"
            className={`
        absolute z-10
        ${isMobile
                    ? 'w-48 h-16 bottom-24 left-1/2 transform -translate-x-1/2'
                    : 'w-1/3 h-24 bottom-32 left-1/2 transform -translate-x-1/2'
                }
      `}
        // Ready for animations - you can add glitch/wiggle class later
        />
    )
}