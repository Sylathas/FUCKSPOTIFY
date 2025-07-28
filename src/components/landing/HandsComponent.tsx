interface HandsComponentProps {
    isMobile: boolean
}

export default function HandsComponent({ isMobile }: HandsComponentProps) {
    return (
        <img
            src="/Hands.png"
            alt="Hands"
            className={`
        absolute z-10
        ${isMobile
                    ? 'w-32 h-32 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                    : 'w-7/8 h-7/8 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                }
      `}
        // Ready for animations - you can add wiggle class later
        />
    )
}