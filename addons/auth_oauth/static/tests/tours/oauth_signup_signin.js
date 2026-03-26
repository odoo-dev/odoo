import { registry } from "@web/core/registry";

const logoutFrontEnd = [
    {
        content: "Click on the user dropdown menu to display the logout link",
        trigger: "a:contains('Foo Bar')",
        run: "click",
    },
    {
        content: "Click logout",
        trigger: "button:contains('Logout')",
        run: "click",
        expectUnloadPage: true,
    },
];

const logoutBackEnd = [
    {
        content: "Click on the user dropdown menu to display the logout link",
        trigger: "button.o_user_menu",
        run: "click",
    },
    {
        content: "Click logout",
        trigger: "span[data-menu='logout']",
        run: "click",
        expectUnloadPage: true,
    },
];

const assertLandingPage = (path) => {
    if (window.location.pathname !== path) {
        throw new Error("The user did not land on the expected URL '" + path + "'.");
    }
};

registry.category("web_tour.tours").add("auth_oauth.odoo_com", {
    steps: () => [
        // 1. Sign up with Odoo.com
        {
            content: "Click the sign in button",
            trigger: "a:contains('Sign in')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Click the link to register a new account",
            trigger: 'a:contains("Don\'t have an account?")',
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Click the link to create a new account using Odoo.com",
            trigger: "a:contains('Sign in with Odoo.com')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Check the user is successfully signed",
            trigger: "a:contains('Foo Bar')",
        },
        {
            content: "As the user is portal, check the user has been redirected to /",
            trigger: "body",
            run: () => assertLandingPage("/"),
        },
        ...logoutFrontEnd,
        // 2. Sign in with Odoo.com
        {
            content: "Click the sign in button",
            trigger: "a:contains('Sign in')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Click the link to login with odoo.com",
            trigger: "a:contains('Sign in with Odoo.com')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Check the user is successfully signed",
            trigger: "a:contains('Foo Bar')",
        },
        {
            content: "As the user is portal, check the user has been redirected to /",
            trigger: "body",
            run: () => assertLandingPage("/"),
        },
        ...logoutFrontEnd,
        // 3. Try to sign in with Odoo.com with an invalid token
        {
            content: "Click the sign in button",
            trigger: "a:contains('Sign in')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Try to sign in with an invalid access token",
            // The mocked `oauth2/auth` route is configured to provide an invalid token at its 3rd hit
            trigger: "a:contains('Sign in with Odoo.com')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Check the sign in failed",
            trigger: "p.alert:contains('Access Denied')",
        },
        {
            content: "Check the sign in failed. An alert should display the access is denied",
            trigger: "p.alert:contains('Access Denied')",
        },
        {
            content: "Check the sign in button is still displayed as the user is not connected",
            trigger: "a:contains('Sign in')",
        },
        // 4. Try to reset password the admin user, who is not linked to an OAuth user yet,
        // and use Sign in with odoo.com.
        {
            content: "Go to the reset password link of the admin",
            trigger: "body",
            run: () => {
                window.location = "/web/reset_password?token=foo";
            },
            expectUnloadPage: true,
        },
        {
            content: "Click the link to login with odoo.com",
            // The mocked `oauth2/auth` route is configured to provide a valid token for the admin at its 4th hit
            trigger: "a:contains('Sign in with Odoo.com')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Check the user is successfully signed",
            trigger: "button small:contains('Mitchell Admin'):not(:visible)",
        },
        {
            content: "As the user is internal, check the user has been redirected to /odoo",
            trigger: "body",
            run: () => assertLandingPage("/odoo"),
        },
        ...logoutBackEnd,
        // 5. Now the admin enabled its OAuth account with the above reset password link, check he can sign in with it
        {
            content: "Click the sign in button",
            trigger: "a:contains('Sign in')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Click the link to login with odoo.com",
            // The mocked `oauth2/auth` route is configured to provide a valid a token for the admin at its 5th hit
            trigger: "a:contains('Sign in with Odoo.com')",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Check the user is successfully signed",
            trigger: "button small:contains('Mitchell Admin'):not(:visible)",
        },
        {
            content: "As the user is internal, check the user has been redirected to /odoo",
            trigger: "body",
            run: () => assertLandingPage("/odoo"),
        },
    ],
});
