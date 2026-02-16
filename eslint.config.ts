// eslint.config.js
export default [
    {
        rules: {
            "@typescript-eslint/naming-convention": [
                "error",
                {
                    "selector": "method",
                    "format": ["camelCase"],
                    "leadingUnderscore": "allow" // 允许私有方法使用下划线前缀
                },
                {
                    "selector": "function",
                    "format": ["camelCase"]
                }
            ]
        }
    }
];