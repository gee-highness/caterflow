// studio/logo.tsx
import React from 'react';

const MyLogo = () => {
    return (
        <img
            src="/logo.png" // ⬅️ The path now points to the static directory
            alt="Caterflow"
            style={{
                height: '30px',
                objectFit: 'contain',
            }}
        />
    );
};

export default MyLogo;