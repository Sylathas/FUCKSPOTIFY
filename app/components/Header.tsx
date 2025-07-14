"use client";

import Image from "next/image";
import { motion } from "framer-motion";     // already in Next.js runtime

const floatAnim = {
    y: [0, -20, 0],
    transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
};

export default function Header() {
    return (
        <header className="relative flex h-[40vh] items-center justify-center bg-red-600">
            {/* Big text */}
            <h1 className="z-10 text-8xl font-extrabold text-black drop-shadow-[4px_4px_0_#fff]">
                F**K SPOTIFY
            </h1>

            {/* Left hand */}
            <motion.div
                className="absolute left-4 top-1/2 -translate-y-1/2"
                animate={floatAnim}
            >
                <Image
                    src="/hand.png" // replace with your asset
                    alt="hand left"
                    width={200}
                    height={300}
                />
            </motion.div>

            {/* Right hand */}
            <motion.div
                className="absolute right-4 top-1/2 -translate-y-1/2 rotate-180"
                animate={floatAnim}
            >
                <Image
                    src="/hand.png" // mirror or separate asset
                    alt="hand right"
                    width={200}
                    height={300}
                />
            </motion.div>
        </header>
    );
}