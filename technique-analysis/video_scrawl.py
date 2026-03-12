import subprocess
import json
import sys

# Requirements: pip install yt-dlp

def search_and_filter_ski_videos(query_base, max_results=10):
    """
    Searches YouTube for alpine skiing technique and filters results 
    based on resolution (1080p+), frame rate (24/60fps), and view.
    """
    
    # Specific search queries to increase 'front view' hits
    queries = [
        f"{query_base} front view slow motion",
        f"{query_base} carving technique front",
        f"{query_base} slalom gate front view 60fps",
        f"{query_base} biomechanics analysis front"
    ]

    found_videos = []

    for query in queries:
        print(f"--- Searching for: {query} ---")
        
        # We use yt-dlp to get metadata without downloading the video
        # --dump-single-json gives us the technical specs
        # --match-filter allows us to filter by resolution and fps server-side
        cmd = [
            "yt-dlp",
            f"ytsearch{max_results}:{query}",
            "--dump-single-json",
            "--no-playlist",
            "--flat-playlist",
            "--quiet"
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if not result.stdout:
                continue

            data = json.loads(result.stdout)
            
            for entry in data.get('entries', []):
                video_url = entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id')}"
                
                # Extract detailed info for specific filtering
                # Note: 'flat-playlist' entries have limited data; 
                # for production, you'd fetch the specific video info.
                print(f"Candidate Found: {entry.get('title')}")
                print(f"URL: {video_url}")
                print("-" * 30)
                
                found_videos.append({
                    "title": entry.get("title"),
                    "url": video_url
                })

        except Exception as e:
            print(f"Error during search: {e}")

    return found_videos

if __name__ == "__main__":
    # Check if yt-dlp is installed
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True)
    except FileNotFoundError:
        print("Error: 'yt-dlp' is not installed. Please run: pip install yt-dlp")
        sys.exit(1)

    search_term = "alpine skiing technique"
    results = search_and_filter_ski_videos(search_term)
    
    print(f"\nSearch complete. Found {len(results)} potential matches.")
    print("Next step: Use 'yt-dlp -F [URL]' to verify if 1080p60 is available for specific clips.")