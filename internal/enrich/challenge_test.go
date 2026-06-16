package enrich

import "testing"

func TestLooksLikeChallenge(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{
			name: "cloudflare just a moment",
			text: "Just a moment... Checking your browser before accessing the site. This process is automatic. DDoS protection by Cloudflare.",
			want: true,
		},
		{
			name: "perimeterx-style",
			text: "Please enable JavaScript and cookies to continue. Verify you are human.",
			want: true,
		},
		{
			name: "ok real content",
			text: "Acme Corp builds AI infrastructure for machine learning platforms. We are a Series B startup based in San Francisco with a distributed team. Our open-source projects power developer tools at hundreds of companies. We're hiring senior engineers across the stack — staff, founding, and platform roles. Our customers include leading ML teams at FAANG and high-growth startups. The product is a unified orchestration layer for AI agents, with strong type safety and developer experience as our north star. Founded in 2022, latest round in 2025.",
			want: false,
		},
		{
			name: "ok short but no challenge keyword",
			text: "Tiny landing page. Welcome.",
			want: false,
		},
		{
			name: "long page incidentally mentioning challenge boilerplate",
			text: longString("Welcome to our site. ", 60) + " Just a moment... ", // > 1000 runes so the keyword shouldn't flip the verdict
			want: false,
		},
		{
			name: "empty",
			text: "",
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := looksLikeChallenge(tc.text); got != tc.want {
				t.Errorf("looksLikeChallenge(%q...) = %v, want %v", first(tc.text, 60), got, tc.want)
			}
		})
	}
}

func TestStatusForBadCode(t *testing.T) {
	cases := []struct {
		name string
		code int
		body string
		want string
	}{
		{
			name: "cloudflare challenge on a 403",
			code: 403,
			// Mirrors the real Cloudflare interstitial: the visible text is just
			// "Just a moment..." once the <script>/<style> blocks are stripped.
			body: `<html><head><style>body{display:flex}</style></head><body><h1>Just a moment...</h1><script>window._cf_chl_opt={};</script></body></html>`,
			want: "challenge",
		},
		{
			name: "challenge served as a 503",
			code: 503,
			body: `<html><body>Checking your browser before accessing the site.</body></html>`,
			want: "challenge",
		},
		{
			name: "plain forbidden, no challenge body",
			code: 403,
			body: `<html><body>forbidden</body></html>`,
			want: "http_403",
		},
		{
			name: "empty body falls back to the code",
			code: 403,
			body: "",
			want: "http_403",
		},
		{
			name: "not found",
			code: 404,
			body: `<html><body>Page not found</body></html>`,
			want: "http_404",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := statusForBadCode(tc.code, []byte(tc.body)); got != tc.want {
				t.Errorf("statusForBadCode(%d, %q) = %q, want %q", tc.code, first(tc.body, 40), got, tc.want)
			}
		})
	}
}

func longString(unit string, n int) string {
	s := ""
	for i := 0; i < n; i++ {
		s += unit
	}
	return s
}

func first(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
