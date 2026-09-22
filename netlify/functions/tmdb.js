// netlify/functions/tmdb.js
//
// This function runs on Netlify's servers, never in the browser.
// It reads TMDB_API_KEY from Netlify's environment variables and
// attaches it to every request, so the key never reaches the client.
//
// The frontend calls this as:  /.netlify/functions/tmdb?path=<tmdb-endpoint>&<other params>
// Example:                     /.netlify/functions/tmdb?path=search/movie&query=dune

const TMDB_BASE = "https://api.themoviedb.org/3";

exports.handler = async (event) => {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server is missing TMDB_API_KEY. Set it in Netlify > Site configuration > Environment variables.",
      }),
    };
  }

  const params = event.queryStringParameters || {};
  const { path, ...rest } = params;

  if (!path) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required 'path' query parameter." }),
    };
  }

  const url = new URL(`${TMDB_BASE}/${path}`);
  url.searchParams.set("api_key", apiKey);
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Could not reach TMDB.", details: err.message }),
    };
  }
};
